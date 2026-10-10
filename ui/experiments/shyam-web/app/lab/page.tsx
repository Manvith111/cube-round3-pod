'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlaskConical, Play, Upload, AlertTriangle, Clock, Camera, Trash2, X } from 'lucide-react';
import RunSyncRail, { RailStage, RailState } from '@/components/ui/run-sync-rail';
import RunResults from '@/components/lab/RunResults';
import { BLURB, ErrorBox, NAMES, captureUrl, stem } from '@/components/lab/bits';
import PhotoProgress from '@/components/ui/photo-progress';
import type { CaptureResult, CaseInfo, Meta, RunView } from '@/components/lab/types';
import { applyEvent, emptyLive, followRun, getJson, liveFromPlan, LiveRun, parcelPlan, postJson } from '@/lib/liveRun';
import AgenticFactory3D from '@/components/ui/agentic-factory-3d';
import BuildPipeline from '@/components/ui/build-pipeline';
import { buildPipelineRun } from '@/components/lab/pipelineRun';
import CameraCapture, { type WebcamShot } from '@/components/lab/CameraCapture';
import CustomCaseForm, { EMPTY_CUSTOM, customPayload, customProblem, type CustomCase } from '@/components/lab/CustomCaseForm';

const ROLE_BTN: Record<string, string> = { capture: 'Add images', reference: 'Add reference photos', returned: 'Add returned photos' };
const WEBCAM_BTN: Record<string, string> = { capture: 'Take photo', reference: 'Take reference photo', returned: 'Take returned photo' };
const TESTS: { key: string; label: string; hint: string }[] = [
  { key: 'wrong_company', label: 'Wrong company', hint: 'Runs the unit under the other company: the refusal must be recorded' },
  { key: 'no_image', label: 'No image', hint: 'Points the input folder at an empty one for this run only' },
  { key: 'agent_down', label: 'Agent down', hint: 'Calls the agent where nothing listens' },
];

interface CaseOption {
  unit_id: string;
  org_id: string;
  label: string;
}

const readB64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',', 2)[1] || '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function LabPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [track, setTrack] = useState('receiving');
  const [mode, setMode] = useState<'single' | 'full'>('single');
  const [org, setOrg] = useState('org_demo_alpha');
  const [unit, setUnit] = useState('UNIT-0014');

  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(null);
  const [caseLine, setCaseLine] = useState('');
  const [pair, setPair] = useState('');

  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [useCustom, setUseCustom] = useState(false);
  const [custom, setCustom] = useState<CustomCase>(EMPTY_CUSTOM);
  const [cameraRole, setCameraRole] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<LiveRun>(emptyLive());
  const [runKey, setRunKey] = useState(0);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [run, setRun] = useState<RunView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------- setup
  useEffect(() => {
    getJson<Meta>('/api/lab/meta')
      .then((m) => {
        setMeta(m);
        setOrg((o) => (m.orgs.includes(o) ? o : m.orgs[0]));
      })
      .catch((e) => setError(e.message));
    getJson<{ cases: CaseOption[] }>('/api/pipeline/cases')
      .then((c) => setCases(c.cases))
      .catch(() => undefined); // the unit box still works typed by hand
    return () => abortRef.current?.abort();
  }, []);

  const loadCase = useCallback(async () => {
    const u = unit.trim();
    if (!u) return;
    try {
      const info = await getJson<CaseInfo>(`/api/lab/case?org=${encodeURIComponent(org)}&unit=${encodeURIComponent(u)}`);
      setCaseInfo(info);
      setCaseLine(`${u} in ${org}: route ${info.case.route}, ${info.case.returned ? 'has a return' : 'no return'}.`);
    } catch (e: any) {
      setCaseInfo(null);
      setCaseLine(e.message);
    }
  }, [org, unit]);

  // follow the unit box while typing, without calling the backend on every key
  useEffect(() => {
    const t = setTimeout(loadCase, 300);
    return () => clearTimeout(t);
  }, [loadCase]);

  const pairs = caseInfo?.returns_pairs ?? [];
  const pairVisible = pairs.length > 0 && (track === 'returns' || mode === 'full');
  // keep the chosen pair if it still exists (or "all" was chosen on purpose); otherwise start on the first complete pair
  useEffect(() => {
    setPair((old) => (old === 'all' || pairs.includes(Number(old)) ? old : String(pairs[0] ?? 'all')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseInfo]);
  const currentPair = pairVisible && pair !== 'all' ? Number(pair) : null;

  const naming = meta?.naming[track];
  const files = caseInfo?.captures[track]?.orchestrator_would_send ?? [];
  const titleOf = (id: string) => NAMES[id] || id;

  // ---------------------------------------------------------------- captures
  const showSaved = async (r: CaptureResult) => {
    setCaptureResult(r);
    setCaptureError(null);
    await loadCase();
  };

  const doUpload = async (input: HTMLInputElement, role: string) => {
    const list = Array.from(input.files || []);
    input.value = '';
    if (!list.length) return;
    setUploading(true);
    try {
      const items = [];
      for (const f of list) items.push({ role, filename: f.name, data_b64: await readB64(f) });
      await showSaved(await postJson<CaptureResult>('/api/lab/captures', { action: 'upload', unit: unit.trim(), stage: track, items }));
    } catch (e: any) {
      setCaptureError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const doCopy = async () => {
    const items: { role: string; path: string }[] = [];
    for (const [role, text] of Object.entries(paths)) {
      text.split(/\r?\n/).forEach((line) => line.trim() && items.push({ role, path: line.trim() }));
    }
    try {
      await showSaved(await postJson<CaptureResult>('/api/lab/captures', { action: 'copy', unit: unit.trim(), stage: track, items }));
      setPaths({});
    } catch (e: any) {
      setCaptureError(e.message);
    }
  };

  // a webcam photo is saved exactly like an uploaded one
  const saveWebcamShot = async (role: string, shot: WebcamShot) => {
    const r = await postJson<CaptureResult>('/api/lab/captures', {
      action: 'upload',
      unit: unit.trim(),
      stage: track,
      items: [{ role, filename: shot.filename, data_b64: shot.dataBase64 }],
    });
    if (r.errors.length) throw new Error(r.errors[0].error);
    await showSaved(r);
  };

  // remove images from this unit's stage folder: the given file names, or every image there
  const removeImages = async (names?: string[]) => {
    try {
      await postJson('/api/lab/captures', { action: 'delete', unit: unit.trim(), stage: track, names });
      setCaptureResult(null);
      setCaptureError(null);
      await loadCase();
    } catch (e: any) {
      setCaptureError(e.message);
    }
  };

  // ---------------------------------------------------------------- running
  const doRun = async (test: string | null) => {
    if (busy || !unit.trim()) return;
    if (useCustom) {
      const problem = customProblem(custom);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setMoreOpen(false);
    setBusy(true);
    setRun(null);
    setError(null);
    setLive(emptyLive());
    setRunKey((k) => k + 1); // plays the GSAP intro at once
    setStartedAt(new Date().toISOString());
    setStatus(`Running ${mode === 'single' ? 'one stage' : 'the whole workflow'}${test ? ` (${test.replace('_', ' ')})` : ''}... model calls can take a while.`);
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const started = await postJson<{ run_id: string; plan: { stage: string; will_run: boolean; reason?: string | null }[] | null }>(
        '/api/lab/run',
        { mode, stage: track, org_id: org, unit_id: unit.trim(), test, pair: currentPair, custom: useCustom ? customPayload(custom) : undefined }
      );
      setLive(liveFromPlan(started.plan, track));
      const final = await followRun(
        started.run_id,
        (events) => setLive((prev) => events.reduce((acc, e) => applyEvent(acc, e, titleOf), prev)),
        ctl.signal
      );
      if (!final) return; // left the page
      setRun(final.result as RunView);
      setStatus(`Done in ${(final.result.elapsed_ms / 1000).toFixed(1)} s.`);
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }));
    } catch (e: any) {
      setStatus('');
      setError(e.message || 'Run failed');
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- rail
  const railStages: RailStage[] = useMemo(() => {
    if (!meta) return [];
    const fromVerdict = (v?: string | null): RailState => (v === 'FAIL' ? 'fail' : v === 'UNCERTAIN' ? 'uncertain' : 'done');
    const ids = run && !busy
      ? run.stages.map((s) => s.stage)
      : Object.keys(live.stages).length
        ? meta.stages.filter((s) => s in live.stages)
        : mode === 'single'
          ? [track]
          : meta.stages;
    return ids.map((id) => {
      let state: RailState = 'queued';
      let note: string | undefined;
      const sr = run && !busy ? run.stages.find((s) => s.stage === id) : undefined;
      const ls = live.stages[id];
      if (sr) {
        if (sr.state === 'skipped') [state, note] = ['skipped', sr.skipped_reason || undefined];
        else if (sr.state === 'pending') state = 'queued';
        else if (sr.stage_error) [state, note] = ['error', sr.stage_error.code];
        else [state, note] = [fromVerdict(sr.verdict), sr.verdict || undefined];
      } else if (ls) {
        if (ls.state === 'running') state = 'running';
        else if (ls.state === 'skipped') [state, note] = ['skipped', ls.note];
        else if (ls.state === 'error') [state, note] = ['error', ls.note];
        else if (ls.state === 'done') [state, note] = [fromVerdict(ls.verdict), ls.verdict || undefined];
      }
      return { id, title: NAMES[id] || id, state, note };
    });
  }, [meta, run, busy, live, mode, track]);

  const showRail = busy || run !== null || runKey > 0;

  // Commerce Evidence Pipeline: the same stage-level rule as the 3D parcel (see components/lab/pipelineRun.ts)
  const pipelineRun = useMemo(
    () =>
      buildPipelineRun({
        stages: meta?.stages ?? ['receiving', 'prep', 'pack', 'returns', 'recovery'],
        scope: { mode, stage: track },
        live,
        run,
        busy,
        id: unit.trim() || 'ACTIVE-RUN',
        branch: `${mode === 'single' ? `One stage · ${NAMES[track] || track}` : 'Whole workflow'} · ${org}`,
        commit: unit.trim() || 'LIVE',
        startedAt,
      }),
    [meta, mode, track, live, run, busy, unit, org, startedAt]
  );

  // 3D parcel: it moves on only when a whole stage is complete (stage-level states, never per-photo or per-check)
  const machineFlow = useMemo(() => {
    let states: Record<string, { state: 'queued' | 'running' | 'done' | 'error' | 'skipped' }> = live.stages;
    if (run && !busy) {
      states = {};
      for (const s of run.stages) {
        states[s.stage] = {
          state: s.state === 'skipped' ? 'skipped' : s.state === 'pending' ? 'queued' : s.stage_error ? 'error' : 'done',
        };
      }
    }
    const plan = parcelPlan(['receiving', 'prep', 'pack', 'returns', 'recovery'], states);
    return {
      runKey,
      startAt: mode === 'single' ? track : 'receiving',
      parcelAt: plan.parcelAt,
      done: plan.done,
      running: busy,
    };
  }, [live.stages, run, busy, runKey, mode, track]);

  // ---------------------------------------------------------------- render
  return (
    <div className="space-y-8 pb-16 w-full max-w-[1400px] mx-auto px-[10px]">
      <div className="flex items-center justify-between border-b border-[var(--neu-border-color)] pb-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-[#773C30]" />
          <span className="font-display font-extrabold text-sm text-slate-900 tracking-tight">Test Pipeline</span>
        </div>
        <span className="text-xs font-mono font-bold text-[#773C30]">Live: real orchestrator, nothing mocked</span>
      </div>

      {error && (
        <ErrorBox>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-none mt-0.5" />
            <span>
              <strong>{run === null && !busy ? 'Something went wrong.' : ''}</strong> {error}
            </span>
          </div>
        </ErrorBox>
      )}

      {cameraRole && (
        <CameraCapture
          title={`Take photos for ${NAMES[track] || track} · ${unit.trim()}`}
          onCapture={(shot) => saveWebcamShot(cameraRole, shot)}
          onClose={() => setCameraRole(null)}
        />
      )}

      {/* 1. TRACK */}
      <section aria-labelledby="lab-s1" className="space-y-3">
        <StepTitle n={1} id="lab-s1">Choose a track</StepTitle>
        <div role="radiogroup" aria-label="Track" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {(meta?.stages ?? []).map((st) => {
            const sel = track === st;
            return (
              <label
                key={st}
                className={`rounded-2xl p-4 cursor-pointer transition border ${
                  sel ? 'neu-pressed-deep border-[#773C30]' : 'neu-flat border-[var(--neu-border-color)] hover:shadow-md'
                } ${busy ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <input type="radio" name="track" value={st} checked={sel} disabled={busy} onChange={() => setTrack(st)} className="sr-only" />
                <span className="block font-display font-extrabold text-sm text-slate-900">{NAMES[st] || st}</span>
                <span className="block text-[11px] text-slate-500 mt-0.5">{BLURB[st]}</span>
                <span className="block text-[10px] font-mono text-[#773C30] mt-1.5 truncate">{meta?.agents[st]?.agent_id}</span>
              </label>
            );
          })}
        </div>
      </section>

      {/* 2. UNIT */}
      <section aria-labelledby="lab-s2" className="space-y-3">
        <StepTitle n={2} id="lab-s2">Choose a unit</StepTitle>
        <div className="rounded-[24px] neu-flat p-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <label className="space-y-1 text-[11px] font-bold uppercase tracking-wider text-slate-600">
            Company
            <select value={org} onChange={(e) => setOrg(e.target.value)} disabled={busy} className="w-full p-3 rounded-2xl neu-input text-xs font-mono font-semibold bg-white normal-case">
              {(meta?.orgs ?? [org]).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-bold uppercase tracking-wider text-slate-600">
            Unit ID
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              list="lab-units"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              className="w-full p-3 rounded-2xl neu-input text-xs font-mono font-semibold bg-white normal-case"
            />
            <datalist id="lab-units">
              {cases.filter((c) => c.org_id === org).map((c) => (
                <option key={c.unit_id} value={c.unit_id}>
                  {c.label}
                </option>
              ))}
            </datalist>
          </label>
          <fieldset className="space-y-1">
            <legend className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Run</legend>
            <div className="flex rounded-2xl neu-pressed-sm p-1 gap-1">
              {(['single', 'full'] as const).map((m) => (
                <label key={m} className={`flex-1 text-center text-xs font-bold py-2 rounded-xl cursor-pointer ${mode === m ? 'neu-btn-highlight' : 'text-slate-600'}`}>
                  <input type="radio" name="mode" value={m} checked={mode === m} disabled={busy} onChange={() => setMode(m)} className="sr-only" />
                  {m === 'single' ? 'One stage' : 'Whole workflow'}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <p className="text-xs text-slate-500 font-mono" aria-live="polite">{caseLine}</p>
        <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
          <input type="checkbox" checked={useCustom} disabled={busy} onChange={(e) => setUseCustom(e.target.checked)} className="w-4 h-4 accent-[#773C30]" />
          Use my own case: I type what the photos should show (works with any unit ID)
        </label>
        {useCustom && <CustomCaseForm value={custom} onChange={setCustom} disabled={busy} />}
      </section>

      {/* 3. IMAGES */}
      <section aria-labelledby="lab-s3" className="space-y-3">
        <StepTitle n={3} id="lab-s3">Add images</StepTitle>
        <div className="rounded-[24px] neu-flat p-5 space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <strong className="text-sm text-slate-900">{files.length ? `${files.length} image${files.length === 1 ? '' : 's'} ready` : 'No images yet'}</strong>
            <span className="flex flex-wrap items-center gap-3">
              {files.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Remove all ${files.length} image(s) for ${NAMES[track] || track} of ${unit.trim()}? This deletes the files from the folder shown.`)) void removeImages();
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:underline cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear all
                </button>
              )}
              <span className="text-[11px] font-mono text-slate-500 break-all">{caseInfo?.captures[track]?.folder}</span>
            </span>
          </div>

          {files.length ? (
            <div className="flex flex-wrap gap-3">
              {files.map((f) => {
                const s = stem(f.ref);
                const dim = track === 'returns' && currentPair !== null && s !== `reference_${currentPair}` && s !== `returned_${currentPair}`;
                return (
                  <figure key={f.ref} className={`relative w-28 ${dim ? 'opacity-40' : ''}`} title={`${f.ref}\nsha256 ${f.sha256}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={captureUrl(f.ref)} alt={f.ref} loading="lazy" className="w-28 h-28 object-cover rounded-xl bg-slate-100" />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeImages([f.ref.split(/[\\/]/).pop() || ''])}
                      aria-label={`Remove ${f.ref.split(/[\\/]/).pop()}`}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 border border-slate-300 text-slate-700 hover:bg-rose-50 hover:text-rose-700 flex items-center justify-center cursor-pointer disabled:opacity-50"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <figcaption className="text-[10px] font-mono text-slate-600 mt-1">
                      {s} {track === 'returns' && currentPair !== null && !dim && <span className="text-emerald-700 font-bold">sent</span>}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 rounded-xl neu-pressed-sm p-4">
              Add images below (upload them, or take them with your webcam). With none, the agent gets <code>inputs: []</code>.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {(naming?.roles ?? []).map((r) => (
              <React.Fragment key={r.role}>
              <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl neu-btn-secondary text-xs font-bold text-slate-800 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-[#773C30]" />
                {ROLE_BTN[r.role] || 'Add images'}
                <input
                  type="file"
                  multiple
                  accept={(meta?.image_exts ?? []).join(',')}
                  className="sr-only"
                  disabled={busy || uploading}
                  onChange={(e) => doUpload(e.currentTarget, r.role)}
                />
              </label>
              <button
                type="button"
                onClick={() => setCameraRole(r.role)}
                disabled={busy || uploading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl neu-btn-secondary text-xs font-bold text-slate-800 cursor-pointer disabled:opacity-60"
              >
                <Camera className="w-3.5 h-3.5 text-[#773C30]" />
                {WEBCAM_BTN[r.role] || 'Take photo'}
              </button>
              </React.Fragment>
            ))}
            {uploading && <span className="text-xs text-slate-500 self-center">Saving...</span>}
          </div>
          <p className="text-[11px] text-slate-500">{naming?.rule}</p>

          <details className="text-xs">
            <summary className="cursor-pointer font-bold text-slate-700">Copy from file paths instead</summary>
            <div className="mt-3 space-y-3">
              {(naming?.roles ?? []).map((r) => (
                <label key={r.role} className="block space-y-1 font-bold text-slate-600">
                  {r.label}: one path per line
                  <textarea
                    rows={2}
                    spellCheck={false}
                    value={paths[r.role] || ''}
                    onChange={(e) => setPaths((p) => ({ ...p, [r.role]: e.target.value }))}
                    className="w-full p-2.5 rounded-2xl neu-input text-xs font-mono bg-white"
                  />
                </label>
              ))}
              <button type="button" onClick={doCopy} className="px-4 py-2 rounded-xl neu-btn-secondary text-xs font-bold cursor-pointer">
                Copy files
              </button>
            </div>
          </details>

          <div aria-live="polite" className="space-y-2">
            {captureResult && (
              <>
                {captureResult.saved.length > 0 && (
                  <p className="text-xs text-slate-600">
                    Saved {captureResult.saved.filter((s) => s.status === 'saved').length}
                    {captureResult.saved.some((s) => s.status === 'already_present')
                      ? `, ${captureResult.saved.filter((s) => s.status === 'already_present').length} already there`
                      : ''}
                    . Originals unchanged{captureResult.saved.some((s) => s.original_unchanged === false) ? ' (CHECK: one changed)' : ''}.
                  </p>
                )}
                {captureResult.errors.length > 0 && (
                  <ErrorBox>
                    <strong>Could not save:</strong>
                    <ul className="list-disc pl-4">
                      {captureResult.errors.map((e, i) => (
                        <li key={i}>
                          <code>{e.source}</code>: {e.error}
                        </li>
                      ))}
                    </ul>
                  </ErrorBox>
                )}
              </>
            )}
            {captureError && <ErrorBox>{captureError}</ErrorBox>}
          </div>
        </div>
      </section>

      {/* RUN BAR */}
      <section aria-label="Run" className="flex flex-wrap items-center gap-3 rounded-[24px] neu-flat p-4">
        {pairVisible && (
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            Returns photos sent
            <select value={pair} onChange={(e) => setPair(e.target.value)} disabled={busy} className="p-2.5 rounded-xl neu-input text-xs font-mono bg-white normal-case">
              {pairs.map((p) => (
                <option key={p} value={p}>
                  Pair {p} only
                </option>
              ))}
              <option value="all">All photos</option>
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={() => doRun(null)}
          disabled={busy || !meta || !unit.trim()}
          className="px-8 py-4 rounded-2xl neu-btn-highlight font-display font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-60"
        >
          {busy ? <Clock className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
          {busy ? 'Running...' : 'Run test'}
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            disabled={busy}
            aria-expanded={moreOpen}
            className="px-4 py-3 rounded-2xl neu-btn-secondary text-xs font-bold text-slate-800 cursor-pointer"
          >
            More checks
          </button>
          {moreOpen && (
            <div className="absolute z-20 mt-2 w-72 rounded-2xl bg-white neu-flat p-2 space-y-1">
              {TESTS.map((t) => (
                <button key={t.key} type="button" onClick={() => doRun(t.key)} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 cursor-pointer">
                  <span className="block text-xs font-bold text-slate-900">{t.label}</span>
                  <span className="block text-[10px] text-slate-500">{t.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="text-xs text-slate-500" aria-live="polite">{status}</span>
      </section>

      {/* LIVE */}
      {showRail && <RunSyncRail stages={railStages} runKey={runKey} running={busy} ticker={live.ticker} />}
      {/* kept after the photos finish too, until the full results below replace it */}
      {live.photos && !run && <PhotoProgress photos={live.photos} />}

      {/* COMMERCE EVIDENCE PIPELINE (left) + 3D MACHINE (right). Both read the same stage-level state, so a station
          changes only when a whole stage is complete; per-photo and per-check events never move either of them. */}
      <div className="w-full flex flex-col xl:flex-row items-stretch gap-[10px]">
        <div className="w-full xl:flex-[1.2] min-w-0">
          <BuildPipeline
            runs={[pipelineRun]}
            title="Commerce Evidence Pipeline"
            subtitle="Multi-agent verification from inbound receiving to channel loss recovery."
            selectedRunId={pipelineRun.id}
            onRerun={() => doRun(null)}
            busyRunId={busy ? pipelineRun.id : null}
            rerunLabel="Run test"
          />
        </div>
        <section
          className="w-full xl:flex-[0.8] min-w-0 rounded-3xl neu-flat bg-white/75 p-3 border border-[var(--neu-border-color)]"
          aria-label="3D machine"
        >
          <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-[var(--neu-border-color)]">
            <h3 className="font-display font-extrabold text-xs text-slate-900 tracking-tight">3D Machine</h3>
            <span className="text-[10px] font-mono text-slate-400">moves on when a stage is complete</span>
          </div>
          <AgenticFactory3D height="440px" flow={machineFlow} />
        </section>
      </div>

      {/* RESULTS */}
      <div ref={resultsRef} aria-live="polite">
        {run && <RunResults run={run} onRunChange={setRun} />}
      </div>
    </div>
  );
}

function StepTitle({ n, id, children }: { n: number; id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-2 font-display font-extrabold text-lg text-slate-900">
      <span className="w-6 h-6 rounded-full neu-btn-highlight text-[11px] flex items-center justify-center">{n}</span>
      {children}
    </h2>
  );
}

