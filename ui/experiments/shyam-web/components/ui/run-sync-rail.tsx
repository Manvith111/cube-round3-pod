'use client';

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';

export type RailState = 'queued' | 'running' | 'done' | 'fail' | 'uncertain' | 'error' | 'skipped';

export interface RailStage {
  id: string;
  title: string;
  state: RailState;
  /** One short line under the node: a verdict, a skip reason or an error. */
  note?: string;
}

interface RunSyncRailProps {
  stages: RailStage[];
  /** Goes up by one every time a run is started: that is what plays the intro. */
  runKey: number;
  running: boolean;
  /** Most recent real backend events, oldest first. */
  ticker: string[];
}

const COLOR: Record<RailState, { fill: string; ring: string; text: string }> = {
  queued: { fill: '#e2e8f0', ring: '#cbd5e1', text: '#64748b' },
  running: { fill: '#fde68a', ring: '#773C30', text: '#773C30' },
  done: { fill: '#bbf7d0', ring: '#16a34a', text: '#166534' },
  fail: { fill: '#fecaca', ring: '#dc2626', text: '#991b1b' },
  uncertain: { fill: '#fde68a', ring: '#d97706', text: '#92400e' },
  error: { fill: '#fecaca', ring: '#dc2626', text: '#991b1b' },
  skipped: { fill: '#f1f5f9', ring: '#94a3b8', text: '#64748b' },
};

const LABEL: Record<RailState, string> = {
  queued: 'queued',
  running: 'running',
  done: 'passed',
  fail: 'failed',
  uncertain: 'uncertain',
  error: 'error',
  skipped: 'skipped',
};

const FINISHED: RailState[] = ['done', 'fail', 'uncertain', 'error', 'skipped'];

/**
 * A row of stage nodes. GSAP does the motion; the backend decides when it happens:
 *   - runKey changes  -> intro: the rail draws in and the nodes pop up, so something moves the instant you press start
 *   - a stage starts  -> its node pulses until the backend reports that stage finished
 *   - a stage ends    -> the node snaps, and the line to the next node fills
 * No timer moves a stage forward.
 */
export default function RunSyncRail({ stages, runKey, running, ticker }: RunSyncRailProps) {
  const root = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const fills = useRef<(HTMLDivElement | null)[]>([]);
  const tracks = useRef<(HTMLDivElement | null)[]>([]);
  const scanner = useRef<HTMLDivElement>(null);
  const pulses = useRef<Map<string, gsap.core.Tween>>(new Map());
  const previous = useRef<Map<string, RailState>>(new Map());
  const reduceMotion = useRef(false);
  const introUntil = useRef(0); // performance.now() at which the intro ends; stage motion waits for it

  useEffect(() => {
    reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Intro: plays once per started run.
  useLayoutEffect(() => {
    if (runKey === 0 || !root.current) return;
    previous.current = new Map();
    pulses.current.forEach((t) => t.kill());
    pulses.current.clear();
    const ctx = gsap.context(() => {
      gsap.set(fills.current.filter(Boolean), { scaleX: 0 });
      if (reduceMotion.current) return;
      introUntil.current = performance.now() + 1000;
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from(tracks.current.filter(Boolean), { scaleX: 0, transformOrigin: 'left center', duration: 0.5, stagger: 0.08 })
        .from(
          nodes.current.filter(Boolean),
          { y: 24, scale: 0.4, opacity: 0, duration: 0.55, stagger: 0.07, ease: 'back.out(1.8)' },
          0
        )
        .from('.rail-title', { opacity: 0, y: 8, duration: 0.4, stagger: 0.05 }, 0.2);
    }, root);
    return () => ctx.revert();
  }, [runKey]);

  // A light that travels along the rail while the backend is working.
  useEffect(() => {
    if (!scanner.current || reduceMotion.current) return;
    if (!running) {
      gsap.to(scanner.current, { opacity: 0, duration: 0.3 });
      return;
    }
    const el = scanner.current;
    gsap.set(el, { xPercent: -100, opacity: 1 });
    const tween = gsap.to(el, { xPercent: 400, duration: 1.6, ease: 'power1.inOut', repeat: -1 });
    return () => {
      tween.kill();
    };
  }, [running, runKey]);

  // Follow the real stage states.
  useEffect(() => {
    stages.forEach((st, i) => {
      const before = previous.current.get(st.id);
      if (before === st.state) return;
      previous.current.set(st.id, st.state);
      const node = nodes.current[i];
      if (!node) return;

      pulses.current.get(st.id)?.kill();
      pulses.current.delete(st.id);
      const delay = Math.max(0, introUntil.current - performance.now()) / 1000;

      if (st.state === 'running') {
        if (reduceMotion.current) return;
        pulses.current.set(
          st.id,
          gsap.fromTo(
            node,
            { boxShadow: '0 0 0 0 rgba(119,60,48,0.55)' },
            { boxShadow: '0 0 0 12px rgba(119,60,48,0)', duration: 1, repeat: -1, ease: 'power1.out', delay }
          )
        );
        gsap.fromTo(node, { scale: 1 }, { scale: 1.12, duration: 0.25, yoyo: true, repeat: 1, ease: 'power2.out', delay });
      } else if (FINISHED.includes(st.state)) {
        gsap.set(node, { boxShadow: '0 0 0 0 rgba(0,0,0,0)' });
        const fill = fills.current[i];
        if (reduceMotion.current) {
          if (fill) gsap.set(fill, { scaleX: 1 });
          return;
        }
        if (st.state === 'skipped') {
          gsap.fromTo(node, { opacity: 0.4 }, { opacity: 1, duration: 0.4, delay });
        } else {
          gsap.fromTo(node, { scale: 1.3 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1, 0.4)', delay });
        }
        if (fill) gsap.to(fill, { scaleX: 1, duration: 0.55, ease: 'power2.inOut', transformOrigin: 'left center', delay });
      }
    });
  }, [stages]);

  useEffect(
    () => () => {
      pulses.current.forEach((t) => t.kill());
    },
    []
  );

  return (
    <div ref={root} className="rounded-3xl neu-flat bg-white/80 p-5 sm:p-6 space-y-4 border border-[var(--neu-border-color)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${running ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'}`} />
          <h3 className="font-display font-extrabold text-xs text-slate-900 tracking-tight uppercase">Live backend sync</h3>
        </div>
        <span className="text-[10px] font-mono text-slate-400">{running ? 'following the orchestrator' : 'idle'}</span>
      </div>

      <div className="relative">
        <ol className="relative flex items-start justify-between gap-2" aria-label="Pipeline stages">
          {stages.map((st, i) => {
            const c = COLOR[st.state];
            const last = i === stages.length - 1;
            return (
              <li key={st.id} className="relative flex-1 min-w-0 flex flex-col items-center text-center">
                {!last && (
                  <div
                    ref={(el) => {
                      tracks.current[i] = el;
                    }}
                    className="absolute top-[18px] left-1/2 w-full h-[3px] rounded-full bg-slate-200 overflow-hidden"
                    aria-hidden="true"
                  >
                    <div
                      ref={(el) => {
                        fills.current[i] = el;
                      }}
                      className="h-full w-full origin-left"
                      style={{ background: st.state === 'skipped' ? '#94a3b8' : '#773C30' }}
                    />
                  </div>
                )}
                <div
                  ref={(el) => {
                    nodes.current[i] = el;
                  }}
                  className="relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-mono font-extrabold border-2"
                  style={{ background: c.fill, borderColor: c.ring, color: c.text }}
                  role="img"
                  aria-label={`${st.title}: ${LABEL[st.state]}`}
                >
                  {st.state === 'done' ? '✓' : st.state === 'fail' || st.state === 'error' ? '!' : st.state === 'skipped' ? '–' : i + 1}
                </div>
                <span className="rail-title mt-2 text-[11px] font-bold text-slate-800 truncate max-w-full">{st.title}</span>
                <span className="text-[10px] font-mono uppercase" style={{ color: c.text }}>
                  {LABEL[st.state]}
                </span>
                {st.note && <span className="text-[10px] text-slate-500 leading-tight mt-0.5 line-clamp-2 max-w-[140px]">{st.note}</span>}
              </li>
            );
          })}
        </ol>
        {/* travelling light, sits on the track line */}
        <div className="absolute top-[18px] left-[6%] right-[6%] h-[3px] overflow-hidden pointer-events-none" aria-hidden="true">
          <div
            ref={scanner}
            className="h-full w-1/5 rounded-full opacity-0"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(119,60,48,0.55), transparent)' }}
          />
        </div>
      </div>

      <div
        className="rounded-2xl neu-pressed-sm px-3 py-2 min-h-[56px] font-mono text-[11px] text-slate-600 space-y-0.5"
        aria-live="polite"
        aria-label="Backend events"
      >
        {ticker.length === 0 ? (
          <span className="text-slate-400">Waiting for a run. Events from the backend appear here as they happen.</span>
        ) : (
          ticker.map((line, i) => (
            <div key={`${i}-${line}`} className={i === ticker.length - 1 ? 'text-slate-900' : 'text-slate-500'}>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
