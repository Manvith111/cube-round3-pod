'use client';

import React, { useState } from 'react';
import { X, Wifi, Loader2, CheckCircle2, XCircle, Plug, Camera } from 'lucide-react';
import { CAM_STAGES, CamSettings, CamSource, saveCamSettings } from '@/lib/cams';

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

interface CameraSettingsProps {
  settings: CamSettings;
  onChange: (next: CamSettings) => void;
  onClose: () => void;
}

export default function CameraSettings({ settings, onChange, onClose }: CameraSettingsProps) {
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [connectingAll, setConnectingAll] = useState(false);

  function update(next: CamSettings) {
    saveCamSettings(next);
    onChange(next);
  }

  function setSource(source: CamSource) {
    update({ ...settings, source });
  }

  function setStage(stage: string, patch: Partial<{ url: string; enabled: boolean }>) {
    update({
      ...settings,
      cams: { ...settings.cams, [stage]: { ...settings.cams[stage], ...patch } },
    });
  }

  async function testOne(stage: string): Promise<boolean> {
    const url = settings.cams[stage]?.url?.trim();
    if (!url) {
      setTests((t) => ({ ...t, [stage]: 'fail' }));
      return false;
    }
    setTests((t) => ({ ...t, [stage]: 'testing' }));
    try {
      const res = await fetch('/api/ipcam/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      const ok = Boolean(data.image_base64);
      setTests((t) => ({ ...t, [stage]: ok ? 'ok' : 'fail' }));
      if (ok) setStage(stage, { enabled: true });
      return ok;
    } catch {
      setTests((t) => ({ ...t, [stage]: 'fail' }));
      return false;
    }
  }

  async function connectAll() {
    setConnectingAll(true);
    try {
      for (const stage of CAM_STAGES) {
        if (settings.cams[stage]?.url?.trim()) {
          // eslint-disable-next-line no-await-in-loop
          await testOne(stage);
        }
      }
    } finally {
      setConnectingAll(false);
    }
  }

  function statusIcon(stage: string) {
    const s = tests[stage];
    if (s === 'testing') return <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />;
    if (s === 'ok') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    if (s === 'fail') return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            <Wifi className="w-4 h-4 text-amber-600" /> Camera settings
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Default source */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">
              Default capture source
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setSource('local')}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition ${
                  settings.source === 'local' ? 'bg-amber-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                }`}
              >
                <Camera className="w-3.5 h-3.5" /> Local webcam
              </button>
              <button
                onClick={() => setSource('ipcam')}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition ${
                  settings.source === 'ipcam' ? 'bg-amber-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                }`}
              >
                <Wifi className="w-3.5 h-3.5" /> IP cameras
              </button>
            </div>
          </div>

          {/* Connect all */}
          <button
            onClick={connectAll}
            disabled={connectingAll}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold"
          >
            {connectingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
            Connect all IP cameras
          </button>

          {/* 5 stage sections */}
          <div className="space-y-2.5">
            {CAM_STAGES.map((stage) => (
              <div
                key={stage}
                className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold capitalize text-neutral-700 dark:text-neutral-200">
                    {stage} camera
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px] text-neutral-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.cams[stage]?.enabled || false}
                      onChange={(e) => setStage(stage, { enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    value={settings.cams[stage]?.url || ''}
                    onChange={(e) => setStage(stage, { url: e.target.value })}
                    placeholder="http://192.168.1.5:8080/shot.jpg"
                    className="flex-1 text-xs font-mono px-2.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100"
                  />
                  <button
                    onClick={() => testOne(stage)}
                    className="px-2.5 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200"
                  >
                    Test
                  </button>
                  <span className="w-4 flex justify-center">{statusIcon(stage)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
