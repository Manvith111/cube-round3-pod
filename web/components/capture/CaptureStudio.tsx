'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, Wifi, X, Activity, Loader2, CheckCircle2, Tag } from 'lucide-react';
import { useMotionDetect } from './useMotionDetect';

type Source = 'local' | 'ipcam';

export interface CapturedMeta {
  source: Source;
  product?: { sku: string; title: string };
}

interface CaptureStudioProps {
  stage: string;
  unitId: string;
  onClose: () => void;
  onCaptured: (filename: string, meta: CapturedMeta) => void;
  /** Opens on this source (from camera settings); defaults to local. */
  defaultSource?: Source;
  /** Pre-fills the IP-camera URL for this stage (from camera settings). */
  defaultIpUrl?: string;
}

const IPCAM_URL_KEY = 'pod.ipcam.url';

export default function CaptureStudio({
  stage,
  unitId,
  onClose,
  onCaptured,
  defaultSource = 'local',
  defaultIpUrl = '',
}: CaptureStudioProps) {
  const [source, setSource] = useState<Source>(defaultSource);
  const [ipUrl, setIpUrl] = useState(defaultIpUrl);
  const [autoMotion, setAutoMotion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<string | null>(null);
  const [ipPreview, setIpPreview] = useState<string | null>(null);

  const [sku, setSku] = useState('');
  const [title, setTitle] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (defaultIpUrl) return; // a configured per-stage URL wins over the last-used one
    try {
      const saved = localStorage.getItem(IPCAM_URL_KEY);
      if (saved) setIpUrl(saved);
    } catch {
      /* storage unavailable (private mode) — fine */
    }
  }, [defaultIpUrl]);

  // Local webcam lifecycle
  useEffect(() => {
    let cancelled = false;
    if (source !== 'local') {
      stopLocal();
      return;
    }
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (err: unknown) {
        setError('Camera unavailable: ' + (err instanceof Error ? err.message : 'unknown'));
      }
    })();
    return () => {
      cancelled = true;
      stopLocal();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // IP camera preview poll
  useEffect(() => {
    if (source !== 'ipcam' || !ipUrl) return;
    let stop = false;
    const poll = async () => {
      if (stop) return;
      try {
        const res = await fetch('/api/ipcam/snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: ipUrl }),
        });
        const data = await res.json();
        if (!stop && data.image_base64) {
          setIpPreview(data.image_base64);
          setError(null);
        } else if (!stop && data.error) {
          setError(data.error);
        }
      } catch {
        if (!stop) setError('Could not reach the IP camera.');
      }
      if (!stop) setTimeout(poll, 1200);
    };
    poll();
    return () => {
      stop = true;
    };
  }, [source, ipUrl]);

  function stopLocal() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  const motion = useMotionDetect(videoRef, source === 'local' && autoMotion, () => {
    void captureLocal();
  });

  async function maybeUploadProduct(): Promise<{ sku: string; title: string } | undefined> {
    const s = sku.trim();
    if (!s) return undefined;
    const product = { sku: s, title: title.trim() };
    try {
      await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ ...product, unit_id: unitId }] }),
      });
    } catch {
      /* non-fatal: the image still uploads */
    }
    return product;
  }

  async function captureLocal() {
    const video = videoRef.current;
    if (!video || busy) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    await upload(dataUrl, 'local');
  }

  async function captureIp() {
    if (busy || !ipUrl) return;
    setBusy(true);
    setError(null);
    try {
      const product = await maybeUploadProduct();
      const res = await fetch('/api/ipcam/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ipUrl, unit: unitId, stage, save: true }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // Backend saved it directly; otherwise persist the returned frame via /api/upload.
      let filename: string = data?.saved?.name || '';
      if (!filename && data.image_base64) {
        filename = await rawUpload(data.image_base64);
      }
      finish(filename || 'ipcam.jpg', { source: 'ipcam', product });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'IP capture failed');
    } finally {
      setBusy(false);
    }
  }

  async function rawUpload(dataUrl: string): Promise<string> {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unit_id: unitId,
        stage,
        filename: `${stage}_ipcam_${Date.now()}.jpg`,
        image_base64: dataUrl,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'upload failed');
    return data.filename as string;
  }

  async function upload(dataUrl: string, src: Source) {
    setBusy(true);
    setError(null);
    try {
      const product = await maybeUploadProduct();
      const filename = await rawUpload(dataUrl);
      finish(filename, { source: src, product });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  function finish(filename: string, meta: CapturedMeta) {
    setLastFile(filename);
    setStatus(`Saved ${filename}`);
    onCaptured(filename, meta);
  }

  function rememberUrl(v: string) {
    setIpUrl(v);
    try {
      localStorage.setItem(IPCAM_URL_KEY, v);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl p-6 max-w-lg w-full neu-flat space-y-4 text-left">
        <div className="flex items-center justify-between border-b border-[var(--neu-border-color)] pb-3">
          <h3 className="font-display font-extrabold text-sm text-slate-900 uppercase tracking-wider">
            Capture · {stage} · <span className="font-mono normal-case text-[#773C30]">{unitId}</span>
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source toggle */}
        <div className="flex items-center gap-1 p-1 rounded-xl neu-pressed-sm">
          <button
            onClick={() => setSource('local')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider py-2 rounded-lg cursor-pointer transition-all ${
              source === 'local' ? 'neu-btn-highlight' : 'text-slate-600 hover:text-[#773C30]'
            }`}
          >
            <Camera className="w-3.5 h-3.5 stroke-[2.5]" /> Local webcam
          </button>
          <button
            onClick={() => setSource('ipcam')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider py-2 rounded-lg cursor-pointer transition-all ${
              source === 'ipcam' ? 'neu-btn-highlight' : 'text-slate-600 hover:text-[#773C30]'
            }`}
          >
            <Wifi className="w-3.5 h-3.5 stroke-[2.5]" /> IP camera
          </button>
        </div>

        {source === 'ipcam' && (
          <input
            value={ipUrl}
            onChange={(e) => rememberUrl(e.target.value)}
            placeholder="http://192.168.1.5:8080/shot.jpg"
            className="w-full p-2.5 rounded-xl neu-input text-xs font-mono font-semibold text-slate-900 bg-white"
          />
        )}

        {/* Preview */}
        <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-video flex items-center justify-center">
          {source === 'local' ? (
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          ) : ipPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ipPreview} alt="IP camera preview" className="w-full h-full object-contain" />
          ) : (
            <span className="text-xs text-slate-400 font-medium">
              {ipUrl ? 'Connecting to camera…' : 'Enter an IP-camera URL above'}
            </span>
          )}

          {source === 'local' && autoMotion && (
            <div className="absolute top-2 left-2 right-2 flex items-center gap-2">
              <Activity className={`w-3.5 h-3.5 ${motion.moving ? 'text-red-400' : 'text-emerald-400'}`} />
              <div className="flex-1 h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div
                  className={`h-full transition-all ${motion.moving ? 'bg-red-400' : 'bg-emerald-400'}`}
                  style={{ width: `${Math.round(motion.level * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {source === 'local' && (
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
            <input type="checkbox" checked={autoMotion} onChange={(e) => setAutoMotion(e.target.checked)} />
            <Activity className="w-3.5 h-3.5 text-[#773C30]" /> Auto-capture on motion (motion sensor)
          </label>
        )}

        {/* Product details */}
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
            <Tag className="w-3 h-3 text-[#773C30]" /> Product details (optional — links this unit in the catalog)
          </div>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="SKU e.g. SKU-CABLE-USBC"
            className="p-2.5 rounded-xl neu-input text-xs font-mono font-semibold text-slate-900 bg-white"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title e.g. USB-C Cable"
            className="p-2.5 rounded-xl neu-input text-xs font-mono font-semibold text-slate-900 bg-white"
          />
        </div>

        {error && <p className="text-xs font-semibold text-[#773C30]">{error}</p>}
        {status && !error && (
          <p className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle2 className="w-3.5 h-3.5" /> {status}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => (source === 'local' ? captureLocal() : captureIp())}
            disabled={busy || (source === 'ipcam' && !ipUrl)}
            className="flex-1 py-3 rounded-xl neu-btn-highlight font-display font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4 stroke-[2.5]" />}
            {busy ? 'Saving…' : 'Capture'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-3 rounded-xl neu-btn-secondary text-xs font-bold uppercase tracking-wider text-slate-700 cursor-pointer"
          >
            {lastFile ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
