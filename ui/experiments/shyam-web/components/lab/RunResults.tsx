'use client';

import React, { useEffect, useState } from 'react';
import type { RunView, StageView } from './types';
import {
  Banner,
  ErrorBox,
  KV,
  NAMES,
  Pill,
  RawJson,
  SourceChip,
  VerdictPill,
  captureUrl,
  short,
  show,
  sourceLabel,
} from './bits';
import { postJson } from '@/lib/liveRun';

interface Props {
  run: RunView;
  onRunChange: (run: RunView) => void;
}

const toneOf = (s: StageView) => {
  if (s.state === 'error' || s.stage_error) return 'border-rose-300 bg-rose-50/70';
  return (
    ({ PASS: 'border-emerald-300 bg-emerald-50/70', FAIL: 'border-rose-300 bg-rose-50/70', UNCERTAIN: 'border-amber-300 bg-amber-50/70' } as Record<string, string>)[
      s.verdict || ''
    ] || 'border-amber-300 bg-amber-50/70'
  );
};

function plain(s: StageView): string {
  const d = s.decision || {};
  const c: Record<string, number> = { PASS: 0, FAIL: 0, UNCERTAIN: 0 };
  s.checks.forEach((k) => {
    c[k.verdict] = (c[k.verdict] || 0) + 1;
  });
  return s.stage_error
    ? `This stage ended with an error (${s.stage_error.code}). No judgment was made.`
    : `${s.checks.length} checks: ${c.PASS} passed, ${c.FAIL} failed, ${c.UNCERTAIN} uncertain. Outcome: ${show(d.outcome)}. ${d.reason ? short(d.reason, 220) : ''}`;
}

const isHard = (kind?: string) => kind === 'replay' || kind === 'no_call';

export default function RunResults({ run, onRunChange }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const single = run.request.mode === 'single';
  const wf = run.workflow;
  const fo = wf.final_outcome;
  const real = run.stages.filter((s) => s.source?.kind === 'model').length;
  const withSource = run.stages.filter((s) => s.source);
  const notReal = run.stages.filter((s) => s.source && s.source.kind !== 'model');
  const one = single ? run.stages[0] : null;

  // A new run starts with nothing selected; a one-stage run opens its only stage straight away.
  useEffect(() => {
    const first = run.stages.find((s) => s.state !== 'skipped' && s.state !== 'pending');
    setSelected((cur) => (cur && run.stages.some((s) => s.stage === cur) ? cur : single && first ? first.stage : null));
  }, [run.run_id, run.stages, single]);

  let head: React.ReactNode;
  let sub: string;
  if (wf.status === 'FAILED') {
    head = (
      <>
        Did not complete <VerdictPill v="UNCERTAIN" />
      </>
    );
    sub = wf.errors.map((e) => `${NAMES[e.stage] || e.stage}: ${e.code}`).join(', ') || wf.status_reason;
  } else if (single && one) {
    head = (
      <>
        {NAMES[one.stage]} says <VerdictPill v={one.verdict} />
      </>
    );
    sub = `Outcome: ${show(one.outcome)}. This covers one stage only, not the whole unit.`;
  } else if (fo) {
    head = (
      <>
        {fo.outcome.replace(/_/g, ' ')} <VerdictPill v={fo.verdict} />
      </>
    );
    sub = fo.reason;
  } else {
    head = <>No outcome</>;
    sub = wf.status_reason;
  }

  const selectedStage = run.stages.find((s) => s.stage === selected) || null;

  return (
    <div className="space-y-5">
      {run.test && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs space-y-1">
          <h4 className="font-display font-extrabold text-sm text-amber-900">{run.test.name}</h4>
          <div className="text-slate-600">{run.test.what_ran}</div>
          <div className="text-slate-800">
            Expected: {run.test.expected}.
            <br />
            Observed errors: {show(run.test.observed_error_codes)}
            {run.test.refusal_recorded !== undefined && (
              <>
                . Refusal recorded: <strong>{run.test.refusal_recorded ? 'yes' : 'NO'}</strong>
              </>
            )}
          </div>
        </div>
      )}
      {run.notes.length > 0 && (
        <div className="rounded-2xl border border-[var(--neu-border-color)] bg-white/80 p-3 text-xs text-slate-700">
          {run.notes.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>
      )}

      {/* SUMMARY */}
      <section className="rounded-[28px] neu-flat p-6 space-y-3" aria-label="Result summary">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <Pill tone="slate">{single ? 'One-stage test' : 'Whole workflow'}</Pill>
          <span className="font-mono">
            {run.case.org_id} · {run.request.unit_id} · route {run.case.route}
          </span>
        </div>
        <h3 className="font-display font-extrabold text-2xl text-slate-900 flex flex-wrap items-center gap-2">{head}</h3>
        <p className="text-sm text-slate-600 max-w-4xl">{sub}</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Workflow status" value={wf.status} />
          <Tile
            label={single ? 'Confidence' : 'Stages judged by a real model'}
            value={
              single && one
                ? typeof one.decision?.confidence === 'number'
                  ? String(one.decision.confidence)
                  : 'not reported'
                : `${real} of ${withSource.length}`
            }
          />
          <Tile
            label="Source of the answer"
            value={single && one?.source ? sourceLabel(one.source) : notReal.length ? 'see each stage' : 'real model'}
          />
          <Tile label="Time" value={`${(run.elapsed_ms / 1000).toFixed(1)} s`} />
        </div>
        {!single &&
          notReal.map(
            (s) =>
              s.source?.banner && (
                <Banner key={s.stage} hard={isHard(s.source.kind)}>
                  <span className="font-bold">{NAMES[s.stage]}:</span> {s.source.banner}
                </Banner>
              )
          )}
      </section>

      {/* STAGE CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {run.stages.map((s) => {
          if (s.state === 'skipped' || s.state === 'pending') {
            return (
              <div key={s.stage} className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 space-y-1">
                <div className="font-display font-extrabold text-sm text-slate-700">{NAMES[s.stage]}</div>
                <Pill>{s.state === 'skipped' ? 'Skipped' : 'Did not run'}</Pill>
                <div className="text-[11px] text-slate-500">
                  {s.state === 'skipped' ? s.skipped_reason : 'The workflow stopped before this stage.'}
                </div>
              </div>
            );
          }
          return (
            <button
              key={s.stage}
              type="button"
              onClick={() => setSelected(s.stage)}
              aria-pressed={selected === s.stage}
              className={`text-left rounded-2xl border p-4 space-y-1.5 cursor-pointer transition ${toneOf(s)} ${
                selected === s.stage ? 'ring-2 ring-[#773C30]' : 'hover:shadow-md'
              }`}
            >
              <div className="font-display font-extrabold text-sm text-slate-900">{NAMES[s.stage]}</div>
              <div className="flex flex-wrap gap-1">
                {s.stage_error ? <VerdictPill v="UNCERTAIN" /> : <VerdictPill v={s.verdict} />}
                <SourceChip src={s.source} />
              </div>
              <div className="text-[11px] text-slate-600 font-mono break-words">
                {s.stage_error ? s.stage_error.code : show(s.outcome)}
              </div>
            </button>
          );
        })}
      </div>

      {selectedStage && <StageDetail stage={selectedStage} run={run} />}

      {/* WORKFLOW DETAILS */}
      <details className="rounded-2xl neu-flat p-4 text-xs">
        <summary className="cursor-pointer font-display font-extrabold text-sm text-slate-900">Workflow details</summary>
        <div className="mt-3 space-y-3">
          <KV
            rows={[
              ['workflow_id', <code key="w">{wf.workflow_id}</code>],
              ['status', `${wf.status}: ${wf.status_reason}`],
              ['final outcome', fo ? <span key="f">{fo.outcome} <VerdictPill v={fo.verdict} /></span> : 'null'],
              ['claimable_usd', fo ? show(fo.claimable_usd) : '-'],
              [
                'effective verdicts',
                fo ? (
                  Object.entries(fo.effective_verdicts).length ? (
                    <span key="e" className="inline-flex flex-wrap gap-1">
                      {Object.entries(fo.effective_verdicts).map(([k, v]) => (
                        <span key={k}>
                          {k} <VerdictPill v={v} />
                        </span>
                      ))}
                    </span>
                  ) : (
                    '(none)'
                  )
                ) : (
                  '-'
                ),
              ],
              ['halted', show(wf.halted)],
              [
                'errors',
                wf.errors.length ? (
                  <span key="er">
                    {wf.errors.map((e, i) => (
                      <span key={i} className="block">
                        <code>
                          {e.stage}: {e.code}
                        </code>{' '}
                        {short(e.message, 260)}
                      </span>
                    ))}
                  </span>
                ) : (
                  'none'
                ),
              ],
              [
                'overrides',
                wf.overrides.length ? (
                  <span key="o">
                    {wf.overrides.map((o) => (
                      <span key={o.override_id} className="block">
                        {o.override_id}: {o.supersedes.record_id} <VerdictPill v={o.previous_verdict} /> to{' '}
                        <VerdictPill v={o.new_verdict} /> by {o.actor} ({o.reason})
                      </span>
                    ))}
                  </span>
                ) : (
                  'none'
                ),
              ],
              [
                'Workflow State schema',
                run.workflow_schema_errors.length ? (
                  <span key="s" className="text-rose-700">
                    invalid: {run.workflow_schema_errors.join('; ')}
                  </span>
                ) : (
                  'valid'
                ),
              ],
            ]}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pr-3 py-1">time</th>
                  <th className="pr-3">event</th>
                  <th className="pr-3">stage</th>
                  <th>detail</th>
                </tr>
              </thead>
              <tbody>
                {wf.transitions.map((t, i) => (
                  <tr key={i} className="border-t border-[var(--neu-border-color)] align-top">
                    <td className="pr-3 py-1 font-mono whitespace-nowrap">{t.at}</td>
                    <td className="pr-3">{t.event}</td>
                    <td className="pr-3">{show(t.stage)}</td>
                    <td className="break-words">{show(t.detail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <RawJson label="raw JSON: Workflow State" data={run.raw.workflow_state} />
        </div>
      </details>

      <OverrideForm run={run} onRunChange={onRunChange} />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl neu-pressed-sm p-3">
      <small className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</small>
      <b className="block text-sm text-slate-900 break-words">{value}</b>
    </div>
  );
}

function StageDetail({ stage: s, run }: { stage: StageView; run: RunView }) {
  const d = s.decision || {};
  const src = s.source;
  const readers = s.record_id
    ? run.stages
        .filter((x) => x.client_calls.at(-1)?.previous_evidence_ids.includes(s.record_id as string))
        .map((x) => NAMES[x.stage])
    : [];
  const perImage: any[] | undefined = s.raw.evidence_record?.payload?.per_image;
  const lastCall = s.client_calls.at(-1);

  return (
    <section className="rounded-[28px] neu-flat p-6 space-y-4" aria-label={`${NAMES[s.stage]} details`}>
      <h3 className="font-display font-extrabold text-xl text-slate-900 flex flex-wrap items-center gap-2">
        {NAMES[s.stage]} {s.stage_error ? <VerdictPill v="UNCERTAIN" /> : <VerdictPill v={s.verdict} />} <SourceChip src={src} />
      </h3>
      <p className="text-sm text-slate-700">{plain(s)}</p>
      {src?.banner && <Banner hard={isHard(src.kind)}>{src.banner}</Banner>}
      {s.stage_error && (
        <ErrorBox>
          <strong>{s.stage_error.code}</strong>
          <br />
          {short(s.stage_error.message, 700)}
          <br />
          <span className="text-slate-500">retryable: {show(s.stage_error.retryable)}</span>
        </ErrorBox>
      )}

      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">What it checked</h4>
      {s.checks.length ? (
        <div className="space-y-1.5">
          {s.checks.map((k) => (
            <div key={k.check_key} className="flex flex-wrap items-start gap-2 text-xs border-b border-[var(--neu-border-color)] pb-1.5">
              <VerdictPill v={k.verdict} />
              <span className="font-bold text-slate-800">{k.check_key.replace(/_/g, ' ')}</span>
              <span className="text-slate-600 min-w-0 break-words">
                {short(k.detail || (k.observed !== undefined ? `observed field: ${show(k.observed)}` : ''), 200)}
                {k.verdict === 'UNCERTAIN' && k.uncertain_reason ? <em> ({k.uncertain_reason})</em> : null}
                {typeof k.confidence === 'number' ? ` · confidence ${k.confidence}` : ''}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">No checks in the record (an empty list is not a judgment).</p>
      )}

      {Array.isArray(perImage) && perImage.length > 0 && (
        <>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Image by image</h4>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {perImage.map((p, i) => {
              const name = String(p.ref).replace(/\\/g, '/').split('/').pop();
              return (
                <div key={i} className="flex gap-3 rounded-2xl neu-pressed-sm p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={captureUrl(p.ref)} alt={name || 'capture'} loading="lazy" className="w-24 h-24 object-cover rounded-xl flex-none bg-slate-100" />
                  <div className="min-w-0 text-xs space-y-1">
                    <div>
                      <strong>{name}</strong> {p.status !== 'analysed' && <Pill tone="amber">Error</Pill>}
                    </div>
                    <div className="text-slate-500">
                      {p.photo_shows ? `${p.photo_shows} · ` : ''}
                      {p.latency_ms != null ? `${p.latency_ms} ms` : ''}
                      {p.photo_usable === false ? ' · photo not usable' : ''}
                    </div>
                    {p.error ? (
                      <ErrorBox>
                        {p.error.code}: {short(p.error.message, 320)}
                      </ErrorBox>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {p.checks &&
                          Object.values<any>(p.checks).map((c) => (
                            <span key={c.check_key} className="inline-flex items-center gap-1">
                              <VerdictPill v={c.verdict} />
                              <span className="text-slate-600">{String(c.check_key).replace(/_/g, ' ')}</span>
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Images used</h4>
      {s.folder_files.length ? (
        <div className="flex flex-wrap gap-3">
          {s.folder_files.map((f) => (
            <figure key={f.ref} className={`w-28 ${f.in_inputs_sent ? '' : 'opacity-50'}`} title={`sha256 ${f.sha256}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={captureUrl(f.ref)} alt={f.name} loading="lazy" className="w-28 h-28 object-cover rounded-xl bg-slate-100" />
              <figcaption className="text-[10px] font-mono text-slate-600 mt-1 break-all">
                {f.name} {f.in_inputs_sent ? <span className="text-emerald-700 font-bold">sent</span> : 'not sent'}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          None. The agent was sent <code>inputs: {JSON.stringify(s.inputs_sent)}</code>.
        </p>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer font-bold text-slate-700">Technical details</summary>
        <div className="mt-3 space-y-4">
          <KV
            rows={[
              ['model.name', src ? <code key="n">{src.name}</code> : 'no record'],
              ['model.calls', src ? <code key="c">{show(src.calls)}</code> : '-'],
              ['model.cost_usd', src ? <code key="u">{show(src.cost_usd)}</code> : '-'],
              ['model.version / provider', src ? `${show(src.version)} / ${show(src.provider)}` : '-'],
              ['agent', <span key="a"><code>{show(s.agent_id)}</code>, {src ? short(src.agent_json.implementation, 120) : ''}</span>],
              ['record', <code key="r">{show(s.record_id)}</code>],
              ['confidence', `decision ${show(d.confidence)}, agent output ${show(s.output_confidence)}`],
              ['needs_human / next step', `${show(d.needs_human)} / ${short(s.next_step_recommendation, 100)}`],
              [
                'client',
                s.client_calls.length ? (
                  <span key="cl">
                    {s.client_calls.map((c, i) => (
                      <span key={i} className="block">
                        {c.client}: {c.returned_output ? 'returned an Agent Output' : `no output (${c.exception?.type}: ${short(c.exception?.message, 160)})`}
                      </span>
                    ))}
                  </span>
                ) : (
                  'not called'
                ),
              ],
              ['earlier records passed in', lastCall?.previous_evidence_ids.join(', ') || 'none'],
              ['read by later stages', readers.join(', ') || 'none'],
              [
                'Agent Output schema',
                s.agent_output_schema_errors === null ? 'no output came back' : s.agent_output_schema_errors.length ? <span key="ao" className="text-rose-700">invalid: {s.agent_output_schema_errors.join('; ')}</span> : 'valid',
              ],
              [
                'Evidence Record schema',
                s.evidence_schema_errors === null ? 'no record' : s.evidence_schema_errors.length ? <span key="er" className="text-rose-700">invalid: {s.evidence_schema_errors.join('; ')}</span> : 'valid',
              ],
            ]}
          />
          <RefTable
            title="inputs[] sent to the agent"
            empty="none"
            head={['ref', 'sha256', 'matches the file on disk']}
            rows={s.inputs_sent.map((i) => [
              <code key="a">{i.ref}</code>,
              <span key="b" className="font-mono break-all">{show(i.sha256)}</span>,
              s.folder_files.some((f) => f.sha256 === i.sha256) ? 'yes' : 'NO',
            ])}
          />
          <RefTable
            title="Inputs the record says it examined"
            empty="none listed"
            head={['ref', 'sha256']}
            rows={s.evidence_inputs.map((i) => [<code key="a">{i.ref}</code>, <span key="b" className="font-mono break-all">{show(i.sha256)}</span>])}
          />
          <RefTable
            title="evidence_refs and what they point to"
            empty="no check cites anything"
            head={['ref', 'points to', 'cited by']}
            rows={s.evidence_refs.map((e) => [<code key="a">{e.ref}</code>, e.points_to, e.cited_by.join(', ')])}
          />
          <div>
            <RawJson label="Raw JSON: Agent Output" data={s.raw.agent_output} />
            <RawJson label="Raw JSON: Evidence Record" data={s.raw.evidence_record} />
            <RawJson label="Raw JSON: Agent Input sent" data={s.raw.agent_input} />
          </div>
        </div>
      </details>
    </section>
  );
}

function RefTable({ title, head, rows, empty }: { title: string; head: string[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <div>
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">{title}</h4>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-slate-500">
                {head.map((h) => (
                  <th key={h} className="pr-3 py-1">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-[var(--neu-border-color)] align-top">
                  {r.map((c, j) => (
                    <td key={j} className="pr-3 py-1">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-slate-500">{empty}</p>
      )}
    </div>
  );
}

function OverrideForm({ run, onRunChange }: Props) {
  const recs = run.stages.filter((s) => s.record_id);
  const [record, setRecord] = useState('');
  const [verdict, setVerdict] = useState('PASS');
  const [actor, setActor] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unc = recs.find((s) => s.verdict === 'UNCERTAIN') || recs[0];
    setRecord(unc?.record_id || '');
    setMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.run_id]);

  if (!recs.length) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const next = await postJson<RunView>(`/api/lab/override/${encodeURIComponent(run.run_id)}`, {
        record_id: record,
        new_verdict: verdict,
        actor,
        reason,
      });
      onRunChange(next);
      setMsg({ ok: true, text: `Override recorded. Workflow is now ${next.workflow.status}, outcome ${next.workflow.final_outcome?.outcome}. The original record is unchanged.` });
    } catch (err: any) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded-2xl neu-flat p-4 text-xs">
      <summary className="cursor-pointer font-display font-extrabold text-sm text-slate-900">Override a decision</summary>
      <p className="mt-2 text-slate-500">Calls the orchestrator&apos;s own override. The original record stays unchanged.</p>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1 font-bold text-slate-600">
            Record
            <select value={record} onChange={(e) => setRecord(e.target.value)} className="w-full p-2.5 rounded-2xl neu-input text-xs font-mono bg-white">
              {recs.map((s) => (
                <option key={s.record_id} value={s.record_id as string}>
                  {s.record_id} ({s.verdict})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 font-bold text-slate-600">
            New verdict
            <select value={verdict} onChange={(e) => setVerdict(e.target.value)} className="w-full p-2.5 rounded-2xl neu-input text-xs font-mono bg-white">
              <option>PASS</option>
              <option>FAIL</option>
              <option>UNCERTAIN</option>
            </select>
          </label>
          <label className="space-y-1 font-bold text-slate-600">
            Your name
            <input required autoComplete="off" value={actor} onChange={(e) => setActor(e.target.value)} className="w-full p-2.5 rounded-2xl neu-input text-xs font-mono bg-white" />
          </label>
        </div>
        <label className="block space-y-1 font-bold text-slate-600">
          Reason
          <textarea required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full p-2.5 rounded-2xl neu-input text-xs bg-white" />
        </label>
        <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl neu-btn-highlight text-xs font-bold uppercase cursor-pointer">
          {busy ? 'Recording...' : 'Record override'}
        </button>
      </form>
      {msg && <div className={`mt-3 rounded-xl px-3 py-2 border ${msg.ok ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-rose-50 border-rose-300 text-rose-800'}`}>{msg.text}</div>}
    </details>
  );
}
