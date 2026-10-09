/**
 * Turns the backend's progress events into display state, and follows a run until it is done.
 * Every change here comes from an event the backend reported while the run was in flight: nothing is timed or faked.
 */

export type LiveStageState = 'queued' | 'running' | 'done' | 'error' | 'skipped';

export interface PhotoItem {
  state: 'waiting' | 'processing' | 'done' | 'error';
  verdicts?: Record<string, string> | null;
  ms?: number | null;
  error?: string | null;
  note?: string;
}

export interface PhotoProgress {
  total: number;
  files: string[];
  checks: string[];
  model: string | null;
  items: PhotoItem[];
}

export interface LiveRun {
  stages: Record<string, { state: LiveStageState; verdict?: string | null; note?: string }>;
  photos: PhotoProgress | null;
  ticker: string[];
  /** One line saying what is happening right now. */
  now: string;
}

export const emptyLive = (): LiveRun => ({ stages: {}, photos: null, ticker: [], now: '' });

const MAX_TICKER = 5;
const withLine = (live: LiveRun, line: string): LiveRun => ({
  ...live,
  ticker: [...live.ticker, line].slice(-MAX_TICKER),
  now: line,
});

/** Start-of-run state from the plan the backend returns (null for a one-stage run). */
export function liveFromPlan(plan: { stage: string; will_run: boolean; reason?: string | null }[] | null, stage: string): LiveRun {
  const stages: LiveRun['stages'] = {};
  if (plan) {
    for (const p of plan) {
      stages[p.stage] = p.will_run ? { state: 'queued' } : { state: 'skipped', note: p.reason || 'Not applicable to this unit' };
    }
  } else {
    stages[stage] = { state: 'queued' };
  }
  return { ...emptyLive(), stages };
}

export function applyEvent(prev: LiveRun, e: any, titleOf: (id: string) => string): LiveRun {
  switch (e.type) {
    case 'stage_start': {
      const next = { ...prev, stages: { ...prev.stages, [e.stage]: { ...prev.stages[e.stage], state: 'running' as const } } };
      return withLine(next, `${titleOf(e.stage)} started (${e.inputs} image${e.inputs === 1 ? '' : 's'} sent)`);
    }
    case 'stage_end': {
      const entry = e.ok
        ? { state: 'done' as const, verdict: e.verdict ?? null, note: e.verdict || undefined }
        : { state: 'error' as const, note: e.error };
      const next = { ...prev, stages: { ...prev.stages, [e.stage]: { ...prev.stages[e.stage], ...entry } } };
      return withLine(next, e.ok ? `${titleOf(e.stage)} finished: ${e.verdict || e.status || 'done'}` : `${titleOf(e.stage)} failed: ${e.error}`);
    }
    case 'photos_total': {
      const photos: PhotoProgress = {
        total: e.total,
        files: e.files,
        checks: e.checks,
        model: e.model ?? null,
        items: (e.files as string[]).map(() => ({ state: 'waiting' as const })),
      };
      return withLine({ ...prev, photos }, `Analysing ${e.total} photo${e.total === 1 ? '' : 's'} with ${e.model ?? 'the model'}`);
    }
    case 'photo_start': {
      if (!prev.photos?.items[e.index]) return prev;
      const items = prev.photos.items.slice();
      items[e.index] = { state: 'processing' };
      return withLine({ ...prev, photos: { ...prev.photos, items } }, `Processing ${e.file}`);
    }
    case 'photo_retry': {
      if (!prev.photos?.items[e.index]) return prev;
      const items = prev.photos.items.slice();
      items[e.index] = { ...items[e.index], note: `Retrying: ${e.reason}. Waiting ${e.wait_s} s.` };
      return withLine({ ...prev, photos: { ...prev.photos, items } }, `Retrying photo ${e.index + 1} (${e.reason})`);
    }
    case 'photo_done': {
      if (!prev.photos?.items[e.index]) return prev;
      const items = prev.photos.items.slice();
      items[e.index] = { state: e.status === 'analysed' ? 'done' : 'error', verdicts: e.verdicts, ms: e.ms, error: e.error };
      return withLine({ ...prev, photos: { ...prev.photos, items } }, `Photo ${e.index + 1} ${e.status}${e.ms ? ` in ${e.ms} ms` : ''}`);
    }
    default:
      return prev;
  }
}

/**
 * Where the 3D parcel should be, from stage-level states only. Per-photo and per-check events never matter here:
 * the parcel moves on only when a whole stage is complete, so a hiccup inside a stage cannot send it anywhere.
 *   - a stage counts as finished when it ended ok, or when a later stage has already started
 *   - the parcel stands at the stage after the last finished one (it travels as soon as the stage before is done)
 *   - an errored stage is not finished (the orchestrator may retry it): the parcel waits there
 * `order` is the station order; skipped stages are left out.
 */
export function parcelPlan(
  order: string[],
  stages: Record<string, { state: LiveStageState }>
): { parcelAt: string | null; done: string[] } {
  const planned = order.filter((id) => stages[id] && stages[id].state !== 'skipped');
  if (!planned.length) return { parcelAt: null, done: [] };
  const started = (id: string) => ['running', 'done', 'error'].includes(stages[id].state);
  let furthest = -1;
  planned.forEach((id, i) => {
    if (started(id)) furthest = i;
  });
  const done = planned.filter((id, i) => stages[id].state === 'done' || i < furthest);
  const lastDone = Math.max(-1, ...done.map((id) => planned.indexOf(id)));
  const at = Math.min(planned.length - 1, Math.max(furthest, lastDone + 1, 0));
  return { parcelAt: planned[at], done };
}

export interface FinalProgress {
  result: any | null;
  trace: any | null;
  error: string | null;
}

/**
 * Polls the run until the backend says it is done. `onEvents` gets each new batch in order.
 * Throws if the backend cannot be reached or reports an error for the run; stops quietly if `signal` is aborted.
 */
export async function followRun(
  runId: string,
  onEvents: (events: any[]) => void,
  signal: AbortSignal,
  intervalMs = 400
): Promise<FinalProgress | null> {
  let after = 0;
  for (;;) {
    await new Promise((r) => setTimeout(r, intervalMs));
    if (signal.aborted) return null;
    const res = await fetch(`/api/pipeline/run/${encodeURIComponent(runId)}?after=${after}`, { cache: 'no-store', signal });
    const progress = await res.json();
    if (!res.ok) throw new Error(progress.error || 'Lost contact with the backend');
    after = progress.next;
    if (progress.events?.length) onEvents(progress.events);
    if (progress.done) {
      if (progress.error) throw new Error(progress.error);
      return { result: progress.result, trace: progress.trace, error: null };
    }
  }
}

/** JSON POST that throws the server's message on failure. */
export async function postJson<T = any>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || `HTTP ${res.status}`);
  return data as T;
}

export async function getJson<T = any>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || `HTTP ${res.status}`);
  return data as T;
}
