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
    if (s === 'testing') return <Loader2 className="w-3.5 h-3.5 animate-spin text-[#773C30]" />;
    if (s === 'ok') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
    if (s === 'fail') return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl p-6 max-w-lg w-full neu-flat space-y-4 text-left max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-[var(--neu-border-color)] pb-3">
          <div className="flex items-center gap-2">
            <Wifi className="w-5 h-5 text-[#773C30]" />
            <h3 className="font-display font-extrabold text-base text-slate-900 tracking-tight">Camera Settings</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {/* Default source */}
          <div>
            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">Default capture source</p>
            <div className="flex gap-2">
              <button
                onClick={() => setSource('local')}
                className={`flex-1 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  settings.source === 'local' ? 'neu-btn-highlight' : 'neu-btn-secondary text-slate-700'
                }`}
              >
                <Camera className="w-3.5 h-3.5 stroke-[2.5]" /> Local webcam
              </button>
              <button
                onClick={() => setSource('ipcam')}
                className={`flex-1 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  settings.source === 'ipcam' ? 'neu-btn-highlight' : 'neu-btn-secondary text-slate-700'
                }`}
              >
                <Wifi className="w-3.5 h-3.5 stroke-[2.5]" /> IP cameras
              </button>
            </div>
          </div>

          {/* Connect all */}
          <button
            onClick={connectAll}
            disabled={connectingAll}
            className="w-full py-3 rounded-xl neu-btn-highlight font-display font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {connectingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4 stroke-[2.5]" />}
            Connect all IP cameras
          </button>

          {/* 5 stage sections */}
          <div className="space-y-2.5">
            {CAM_STAGES.map((stage) => (
              <div key={stage} className="rounded-2xl neu-pressed-sm p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider capitalize text-slate-700">
                    {stage} camera
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 cursor-pointer">
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
                    className="flex-1 p-2.5 rounded-xl neu-input text-xs font-mono font-semibold text-slate-900 bg-white"
                  />
                  <button
                    onClick={() => testOne(stage)}
                    className="px-3 py-2 rounded-xl neu-btn-secondary text-[11px] font-bold uppercase tracking-wider text-slate-700 cursor-pointer"
                  >
                    Test
                  </button>
                  <span className="w-4 flex justify-center">{statusIcon(stage)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--neu-border-color)] pt-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl neu-btn-highlight font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
