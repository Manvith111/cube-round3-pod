import type { PipelineLog, PipelineRun, PipelineStage, StageStatus } from '@/components/ui/build-pipeline';
import { parcelPlan, type LiveRun } from '@/lib/liveRun';
import { NAMES, short, show } from './bits';
import type { RunView, StageView } from './types';

/**
 * Turns the lab's run state into the Commerce Evidence Pipeline's run format.
 *
 * It follows the 3D machine's rule: a stage is shown as passed/failed only when the WHOLE stage is complete, and the stage
 * the parcel stands at is the one shown as running (same `parcelPlan`). Per-photo and per-check events never change a
 * station's colour; they only add log lines. Once the run has finished, everything comes from the stored result.
 */
export interface PipelineRunArgs {
  stages: string[];            // every station, in order
  scope: { mode: 'single' | 'full'; stage: string };
  live: LiveRun;
  run: RunView | null;
  busy: boolean;
  id: string;
  branch: string;
  commit: string;
  startedAt: string;
}

const clock = (iso?: string | null) => {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString();
};

function finalStatus(s: StageView | undefined): StageStatus {
  if (!s) return 'queued';
  if (s.state === 'skipped') return 'skipped';
  if (s.state === 'pending') return 'queued';
  if (s.stage_error || s.state === 'error' || s.verdict === 'FAIL') return 'failed';
  return 'passed'; // PASS, and UNCERTAIN (judged, needs a person), as on the Pipeline Trace page
}

function finalLogs(s: StageView, run: RunView): PipelineLog[] {
  const at = clock(run.workflow.transitions.find((t) => t.stage === s.stage)?.at);
  const out: PipelineLog[] = [{ time: at, message: `Station initialized: ${NAMES[s.stage] || s.stage}`, level: 'info' }];
  if (s.state === 'skipped') return [...out, { time: at, message: `Stage bypassed: ${s.skipped_reason || 'not applicable to this unit'}`, level: 'info' }];
  if (s.state === 'pending') return [...out, { time: at, message: 'The workflow stopped before this stage.', level: 'warning' }];
  if (s.source) {
    out.push({ time: at, message: `Model engine: ${s.source.name} (${show(s.source.calls)} calls)`, level: s.source.kind === 'model' ? 'info' : 'warning' });
    if (s.source.banner) out.push({ time: at, message: s.source.banner, level: 'warning' });
  }
  for (const c of s.checks) {
    out.push({
      time: at,
      message: `[CHECK] ${c.check_key}: ${c.verdict}${typeof c.confidence === 'number' ? ` (conf: ${Math.round(c.confidence * 100)}%)` : ''}${c.detail ? ` — ${short(c.detail, 160)}` : ''}`,
      level: c.verdict === 'PASS' ? 'info' : c.verdict === 'FAIL' ? 'error' : 'warning',
    });
  }
  if (s.stage_error) out.push({ time: at, message: `Stage error ${s.stage_error.code}: ${short(s.stage_error.message, 200)}`, level: 'error' });
  if (s.decision) {
    out.push({ time: at, message: `Decision verdict: ${show(s.verdict)} · action: ${show(s.decision.outcome)}`, level: s.verdict === 'FAIL' ? 'error' : 'info' });
    if (s.decision.reason) out.push({ time: at, message: `Rationale: ${short(s.decision.reason, 220)}`, level: 'info' });
  }
  return out;
}

export function buildPipelineRun(a: PipelineRunArgs): PipelineRun {
  const finished = a.run !== null && !a.busy;
  // before anything has run, every station simply waits; the one-stage scope only matters once a run exists
  const started = finished || Object.keys(a.live.stages).length > 0;
  const inScope = (id: string) => !started || a.scope.mode === 'full' || id === a.scope.stage;
  const plan = parcelPlan(a.stages, a.live.stages);
  const byStage: Record<string, StageView | undefined> = Object.fromEntries((a.run?.stages ?? []).map((s) => [s.stage, s]));

  const stages: PipelineStage[] = a.stages.map((id) => {
    const name = NAMES[id] || id;
    const kind = id as PipelineStage['kind'];

    if (!inScope(id)) {
      return { id, name, kind, status: 'skipped', logs: [{ time: clock(), message: 'Not part of this one-stage test.', level: 'info' }] };
    }
    if (finished) {
      const s = byStage[id];
      return { id, name, kind, status: finalStatus(s), durationMs: s?.duration_ms ?? 0, logs: s ? finalLogs(s, a.run as RunView) : [] };
    }

    // a run is going (or nothing has run yet): stage-level states only
    const ls = a.live.stages[id];
    let status: StageStatus = 'queued';
    const logs: PipelineLog[] = [];
    if (ls?.state === 'skipped') {
      status = 'skipped';
      logs.push({ time: clock(), message: `Stage bypassed: ${ls.note || 'not applicable to this unit'}`, level: 'info' });
    } else if (ls && plan.done.includes(id) && ls.state !== 'queued') {
      status = ls.state === 'error' || ls.verdict === 'FAIL' ? 'failed' : 'passed';
      logs.push({ time: clock(), message: ls.state === 'error' ? `Stage failed: ${ls.note ?? 'error'}` : `Stage complete: ${ls.verdict ?? 'done'}`, level: status === 'failed' ? 'error' : 'info' });
    } else if (ls && id === plan.parcelAt) {
      status = 'running';
      logs.push({ time: clock(), message: 'Stage is running on the backend.', level: 'info' });
    }
    // photo-by-photo lines are log text only: they never change the station's state
    if (id === 'receiving' && a.live.photos && status !== 'queued') {
      a.live.photos.items.forEach((p, i) => {
        if (p.state === 'done') logs.push({ time: clock(), message: `Photo ${a.live.photos!.files[i]} analysed${p.ms != null ? ` in ${(p.ms / 1000).toFixed(1)} s` : ''}`, level: 'info' });
        if (p.state === 'error') logs.push({ time: clock(), message: `Photo ${a.live.photos!.files[i]} failed: ${p.error ?? 'error'}`, level: 'warning' });
      });
    }
    return { id, name, kind, status, durationMs: 0, logs };
  });

  return { id: a.id, branch: a.branch, commit: a.commit, startedAt: a.startedAt, stages };
}
