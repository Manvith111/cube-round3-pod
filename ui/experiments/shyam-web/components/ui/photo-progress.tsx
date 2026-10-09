'use client';

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import type { PhotoProgress as PhotoProgressData } from '@/lib/liveRun';

const TICK: Record<string, string> = { PASS: '✓', FAIL: '✕', UNCERTAIN: '?' };
const TONE: Record<string, string> = {
  PASS: 'bg-emerald-50 border-emerald-300 text-emerald-800',
  FAIL: 'bg-rose-50 border-rose-300 text-rose-800',
  UNCERTAIN: 'bg-amber-50 border-amber-300 text-amber-800',
};
const TICK_TONE: Record<string, string> = {
  PASS: 'bg-emerald-500 text-white',
  FAIL: 'bg-rose-500 text-white',
  UNCERTAIN: 'bg-amber-400 text-white',
};

/** A spinning ring: "working on it". */
function Ring({ size = 16, label = 'working' }: { size?: number; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className="inline-block flex-none rounded-full border-2 border-slate-300 border-t-[#773C30] animate-spin"
      style={{ width: size, height: size }}
    />
  );
}

function Tick({ verdict, size = 16 }: { verdict: string | null | undefined; size?: number }) {
  const v = verdict || 'UNCERTAIN';
  return (
    <span
      aria-hidden="true"
      className={`inline-flex flex-none items-center justify-center rounded-full font-extrabold leading-none ${TICK_TONE[v] || TICK_TONE.UNCERTAIN}`}
      style={{ width: size, height: size, fontSize: size * 0.62 }}
    >
      {TICK[v] || '?'}
    </span>
  );
}

/**
 * Receiving looks at one photo at a time. For each photo: waiting, then a spinner while it is processed (with a spinner
 * on every check), then the spinners turn into tick marks that pop in one after another. Every state change comes from
 * an event the server reported for that photo; nothing here is timed or faked.
 */
export default function PhotoProgress({ photos }: { photos: PhotoProgressData }) {
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const seen = useRef<Map<number, string>>(new Map());
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // A new set of photos (a new run) starts from nothing.
  const sig = photos.files.join('|');
  useEffect(() => {
    seen.current = new Map();
  }, [sig]);

  useEffect(() => {
    photos.items.forEach((item, i) => {
      const before = seen.current.get(i);
      if (before === item.state) return;
      seen.current.set(i, item.state);
      const row = rows.current[i];
      if (!row || reduce.current) return;
      if (item.state === 'processing') {
        gsap.fromTo(row, { x: -8, opacity: 0.6 }, { x: 0, opacity: 1, duration: 0.35, ease: 'power2.out' });
      } else if (item.state === 'done' || item.state === 'error') {
        // the spinners just became ticks: pop them in one after another
        gsap.fromTo(
          row.querySelectorAll('[data-pop]'),
          { scale: 0.3, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.45, stagger: 0.07, ease: 'back.out(2.2)', overwrite: 'auto' }
        );
      }
    });
  }, [photos.items]);

  const finished = photos.items.filter((x) => x.state === 'done' || x.state === 'error').length;
  const allDone = finished === photos.total;

  return (
    <section className="rounded-[24px] neu-flat p-5 space-y-3" aria-label="Photo progress">
      <div className="flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
        {allDone ? <Tick verdict="PASS" size={18} /> : <Ring size={18} label="analysing photos" />}
        <strong className="text-slate-900">Receiving: one photo at a time</strong>
        <span className="text-slate-500">
          {finished} of {photos.total} done · model {photos.model ?? 'unknown'}
        </span>
      </div>

      {photos.items.map((ph, i) => {
        const name = photos.files[i];
        return (
          <div
            key={`${i}-${name}`}
            ref={(el) => {
              rows.current[i] = el;
            }}
            className={`rounded-xl neu-pressed-sm p-3 space-y-2 ${ph.state === 'waiting' ? 'opacity-60' : ''}`}
          >
            <div className="flex items-center gap-2 text-xs">
              {ph.state === 'processing' && <Ring />}
              {ph.state === 'done' && <Tick verdict="PASS" />}
              {ph.state === 'error' && <Tick verdict="FAIL" />}
              {ph.state === 'waiting' && <span aria-hidden="true" className="inline-block w-4 h-4 rounded-full border-2 border-dashed border-slate-300 flex-none" />}
              <span className={ph.state === 'processing' ? 'font-bold text-slate-900' : 'text-slate-700'}>
                {ph.state === 'processing' ? `Processing ${name}` : name}
              </span>
              {ph.state === 'waiting' && <span className="text-slate-400">waiting</span>}
              {ph.state === 'done' && ph.ms != null && <span className="text-slate-400">{(ph.ms / 1000).toFixed(1)} s</span>}
              {ph.state === 'error' && <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold uppercase">failed</span>}
            </div>

            {ph.state !== 'waiting' && (
              <div className="flex flex-wrap gap-1.5 pl-6">
                {photos.checks.map((c) => {
                  const nice = c.replace(/_/g, ' ');
                  if (ph.state === 'processing') {
                    return (
                      <span key={c} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200 bg-white text-[10px] text-slate-500" aria-label={`${nice}: working`}>
                        <Ring size={11} label={`${nice}: working`} />
                        {nice}
                      </span>
                    );
                  }
                  if (ph.state === 'error') {
                    return (
                      <span key={c} data-pop className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 text-[10px] text-amber-800" aria-label={`${nice}: no result`}>
                        <Tick verdict="UNCERTAIN" size={12} />
                        {nice}
                      </span>
                    );
                  }
                  const v = ph.verdicts?.[c];
                  return (
                    <span
                      key={c}
                      data-pop
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-semibold ${TONE[v || 'UNCERTAIN'] || TONE.UNCERTAIN}`}
                      aria-label={`${nice}: ${v ?? 'no result'}`}
                    >
                      <Tick verdict={v} size={12} />
                      {nice}
                    </span>
                  );
                })}
              </div>
            )}

            {ph.state === 'processing' && ph.note && <div className="pl-6 text-[11px] text-slate-500">{ph.note}</div>}
            {ph.state === 'error' && ph.error && (
              <div role="alert" className="ml-6 rounded-lg px-3 py-2 text-[11px] bg-rose-50 border border-rose-300 text-rose-800">
                {ph.error}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
