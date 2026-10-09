'use client';

import React, { useState } from 'react';
import type { StageSource } from './types';

export const NAMES: Record<string, string> = {
  receiving: 'Receiving',
  prep: 'Prep',
  pack: 'Pack',
  returns: 'Returns',
  recovery: 'Recovery',
};

export const BLURB: Record<string, string> = {
  receiving: 'Photos of a delivery arriving',
  prep: 'Photos of a prepared unit',
  pack: 'Photo of the open box',
  returns: 'Catalogue vs returned item',
  recovery: 'Fee claims, from earlier evidence',
};

/** A value exactly as returned: null stays "null", objects become JSON. */
export function show(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return '(not present)';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

export function short(v: unknown, n = 150): string {
  const s = show(v);
  return s.length > n ? s.slice(0, n) + '...' : s;
}

export const stem = (ref: string) =>
  (ref.replace(/\\/g, '/').split('/').pop() || '').replace(/\.[^.]+$/, '').toLowerCase();

export const captureUrl = (ref: string) => `/api/lab/capture-file?ref=${encodeURIComponent(ref)}`;

const VERDICT_STYLE: Record<string, string> = {
  PASS: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  FAIL: 'bg-rose-100 text-rose-800 border-rose-300',
  UNCERTAIN: 'bg-amber-100 text-amber-800 border-amber-300',
};

export function VerdictPill({ v }: { v?: string | null }) {
  const style = (v && VERDICT_STYLE[v]) || 'bg-slate-100 text-slate-600 border-slate-300';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-mono font-extrabold uppercase ${style}`}>
      {v ?? 'no verdict'}
    </span>
  );
}

export function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'amber' | 'rose' | 'emerald' }) {
  const t = {
    slate: 'bg-slate-100 text-slate-600 border-slate-300',
    amber: 'bg-amber-100 text-amber-800 border-amber-300',
    rose: 'bg-rose-100 text-rose-800 border-rose-300',
    emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  }[tone];
  return <span className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-mono font-extrabold uppercase ${t}`}>{children}</span>;
}

/** Says where an answer came from, so a replay is never mistaken for a model judging the photo. */
export function SourceChip({ src }: { src: StageSource | null }) {
  if (!src) return null;
  if (src.kind === 'model') return <Pill tone="emerald">Real model</Pill>;
  if (src.kind === 'replay') return <Pill tone="rose">Replay</Pill>;
  if (src.kind === 'no_call') return <Pill tone="rose">No model call</Pill>;
  if (src.kind === 'none') return <Pill tone="amber">No model</Pill>;
  return <Pill tone="amber">Not a model</Pill>;
}

export function sourceLabel(src: StageSource): string {
  return (
    ({ model: src.name, replay: 'Replay of sample data', no_call: 'No model was called', none: 'No model ran' } as Record<string, string>)[
      src.kind
    ] || `Not a model (${src.name})`
  );
}

/** A button that shows or hides pretty-printed JSON. */
export function RawJson({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="inline-block align-top mr-2 mb-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="px-3 py-1.5 rounded-xl neu-btn-secondary text-[11px] font-bold text-slate-700 cursor-pointer"
      >
        {open ? 'Hide' : 'View'} {label}
      </button>
      {open && (
        <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-slate-900 text-slate-100 p-3 text-[11px] leading-snug whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <div className="space-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col sm:flex-row sm:gap-3 text-[11px] border-b border-[var(--neu-border-color)] pb-1">
          <span className="sm:w-56 flex-none font-mono text-slate-500">{k}</span>
          <span className="text-slate-800 break-words min-w-0">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function Banner({ children, hard }: { children: React.ReactNode; hard: boolean }) {
  return (
    <div
      role="note"
      className={`rounded-xl px-3 py-2 text-xs font-semibold border ${
        hard ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-amber-50 border-amber-300 text-amber-900'
      }`}
    >
      {children}
    </div>
  );
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-xl px-3 py-2 text-xs bg-rose-50 border border-rose-300 text-rose-800">
      {children}
    </div>
  );
}
