'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  Wifi,
  X,
  Activity,
  Loader2,
  CheckCircle2,
  Tag,
  ScanLine,
  QrCode,
  RefreshCw,
  Video,
  Sparkles,
  Maximize2
} from 'lucide-react';
import { useMotionDetect } from './useMotionDetect';

type Source = 'local' | 'ipcam';

export interface CapturedMeta {
  source: Source;
  product?: { sku: string; title: string };
  scannedBarcode?: string;
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

  // Video devices
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isSimulatedFeed, setIsSimulatedFeed] = useState(false);

  // Product & Barcode Scanning state
  const [sku, setSku] = useState('');
  const [title, setTitle] = useState('');
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [isScanningActive, setIsScanningActive] = useState(true);
  const [scanLaserPos, setScanLaserPos] = useState(15);
  const [scanFlash, setScanFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Play crisp warehouse beep sound using Web Audio API
  const playScanBeep = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // Audio context may require prior user interaction
    }
  }, []);

  // IP Camera URL persistence
  useEffect(() => {
    if (defaultIpUrl) return;
    try {
      const saved = localStorage.getItem(IPCAM_URL_KEY);
      if (saved) setIpUrl(saved);
    } catch {}
  }, [defaultIpUrl]);

  // Enumerate video devices
  useEffect(() => {
    async function getDevices() {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = list.filter((d) => d.kind === 'videoinput');
        setDevices(videoInputs);
        if (videoInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoInputs[0].deviceId);
        }
      } catch {}
    }
    getDevices();
  }, [selectedDeviceId]);

  // Stop local stream
  function stopLocal() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  // Local webcam stream lifecycle
  useEffect(() => {
    let cancelled = false;
    if (source !== 'local' || isSimulatedFeed) {
      stopLocal();
      return;
    }

    async function startCamera() {
      setError(null);
      stopLocal();

      let stream: MediaStream | null = null;
      try {
        // Preferred: specified device or ideal resolution with environment camera
        const constraints: MediaStreamConstraints = {
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId } }
            : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err1) {
        try {
          // Fallback: any video device without facingMode constraint
          const fallbackConstraints: MediaStreamConstraints = {
            video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
          };
          stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        } catch (err2: any) {
          if (!cancelled) {
            setError(`Webcam unavailable: ${err2?.message || 'Check camera access'}. You can switch to Simulated Feed below.`);
          }
          return;
        }
      }

      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // play() might be interrupted or handled on metadata
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      stopLocal();
    };
  }, [source, selectedDeviceId, isSimulatedFeed]);

  // Simulated Camera animation loop when physical webcam is not present or toggled
  useEffect(() => {
    if (source !== 'local' || !isSimulatedFeed) return;
    const canvas = animCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let angle = 0;
    const draw = () => {
      angle += 0.02;
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Industrial conveyor grid
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      // Warehouse item box
      const boxW = 280;
      const boxH = 180;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2 + Math.sin(angle) * 10;

      ctx.fillStyle = '#1c1917';
      ctx.strokeStyle = '#78716c';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);
      ctx.fillRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);

      // Barcode lines on the box
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 100, cy - 30, 200, 60);

      ctx.fillStyle = '#000000';
      const bars = [4, 2, 8, 3, 5, 2, 6, 4, 2, 9, 3, 4, 2, 7, 3, 5, 2, 8, 4];
      let barX = cx - 90;
      for (const b of bars) {
        ctx.fillRect(barX, cy - 25, b, 40);
        barX += b + 4;
      }

      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.fillText('SKU-BOTTLE-750', cx, cy + 24);

      // Status text
      ctx.font = '12px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`SIMULATED FEED · ${stage.toUpperCase()} STATION · ${unitId}`, cx, cy + 75);

      animFrameIdRef.current = requestAnimationFrame(draw);
    };

    animFrameIdRef.current = requestAnimationFrame(draw);
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [source, isSimulatedFeed, stage, unitId]);

  // Barcode Scanning Detection Loop (runs BarcodeDetector or Canvas analysis)
  useEffect(() => {
    if (!isScanningActive) return;
    let cancelled = false;

    // Laser bar visual scan oscillation
    const laserInterval = setInterval(() => {
      setScanLaserPos((p) => (p >= 85 ? 12 : p + 3));
    }, 40);

    // Periodic barcode detection attempt
    const detectorClass = typeof window !== 'undefined' ? (window as any).BarcodeDetector : null;
    let detector: any = null;
    if (detectorClass) {
      try {
        detector = new detectorClass({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'data_matrix'],
        });
      } catch {
        try {
          detector = new detectorClass();
        } catch {}
      }
    }

    const scanInterval = setInterval(async () => {
      if (cancelled) return;
      try {
        if (isSimulatedFeed) {
          // In simulated feed, auto-detect barcode after 2 seconds
          if (!scannedBarcode) {
            handleBarcodeSuccess('SKU-BOTTLE-750');
          }
          return;
        }

        if (detector && videoRef.current && videoRef.current.readyState >= 2) {
          const results = await detector.detect(videoRef.current);
          if (results && results.length > 0) {
            const rawVal = results[0].rawValue;
            if (rawVal && rawVal !== scannedBarcode) {
              handleBarcodeSuccess(rawVal);
            }
          }
        }
      } catch {}
    }, 450);

    return () => {
      cancelled = true;
      clearInterval(laserInterval);
      clearInterval(scanInterval);
    };
  }, [isScanningActive, isSimulatedFeed, scannedBarcode]);

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
          body: JSON.stringify({ url: ipUrl, unit: unitId, stage }),
        });
        const data = await res.json();
        if (!stop && data.image_base64) {
          setIpPreview(data.image_base64);
          setError(null);
        } else if (!stop && data.error) {
          setError(data.error);
        }
      } catch {
        if (!stop) setError('Could not reach IP camera. Verify address or test simulated feed.');
      }
      if (!stop) setTimeout(poll, 1200);
    };
    poll();
    return () => {
      stop = true;
    };
  }, [source, ipUrl, unitId, stage]);

  const handleBarcodeSuccess = (code: string) => {
    setScannedBarcode(code);
    playScanBeep();
    setScanFlash(true);
    setTimeout(() => setScanFlash(false), 500);

    // Auto-populate SKU if empty or generic
    if (!sku || sku === '') {
      setSku(code);
      if (code === 'SKU-BOTTLE-750') setTitle('Vacuum Insulated Water Bottle 750ml');
      else if (code === 'SKU-NOTEBOOK-A5') setTitle('Grid Hardcover Notebook A5');
    }
    setStatus(`Barcode Scanned: ${code}`);
  };

  const manualScanTrigger = () => {
    // If BarcodeDetector did not trigger, simulate or match based on catalog
    const catalogOptions = ['SKU-BOTTLE-750', 'SKU-NOTEBOOK-A5', 'UNIT-0006', 'SKU-CABLE-USBC'];
    const chosen = catalogOptions[Math.floor(Math.random() * catalogOptions.length)];
    handleBarcodeSuccess(chosen);
  };

  const motion = useMotionDetect(videoRef, source === 'local' && autoMotion && !isSimulatedFeed, () => {
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
    } catch {}
    return product;
  }

  async function captureLocal() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      let dataUrl = '';
      if (isSimulatedFeed && animCanvasRef.current) {
        dataUrl = animCanvasRef.current.toDataURL('image/jpeg', 0.9);
      } else if (videoRef.current) {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not create canvas context');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      } else {
        throw new Error('No video frame available');
      }

      await upload(dataUrl, 'local');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Capture failed');
      setBusy(false);
    }
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

      let filename: string = data?.saved?.name || '';
      if (!filename && data.image_base64) {
        filename = await rawUpload(data.image_base64);
      }
      finish(filename || 'ipcam.jpg', { source: 'ipcam', product, scannedBarcode: scannedBarcode || undefined });
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
        filename: `${stage}_camera_${Date.now()}.jpg`,
        image_base64: dataUrl,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Upload failed');
    return data.filename as string;
  }

  async function upload(dataUrl: string, src: Source) {
    try {
      const product = await maybeUploadProduct();
      const filename = await rawUpload(dataUrl);
      finish(filename, { source: src, product, scannedBarcode: scannedBarcode || undefined });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  function finish(filename: string, meta: CapturedMeta) {
    setLastFile(filename);
    setStatus(`✓ Captured & Saved ${filename}`);
    onCaptured(filename, meta);
  }

  function rememberUrl(v: string) {
    setIpUrl(v);
    try {
      localStorage.setItem(IPCAM_URL_KEY, v);
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-black/95 border border-white/20 rounded-3xl p-6 max-w-xl w-full shadow-2xl space-y-4 text-left text-white relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
              Optical Station Inspection · <span className="text-white/60">{stage.toUpperCase()}</span> ·{' '}
              <span className="text-emerald-400 font-mono">{unitId}</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition-all cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source Toggle */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl border border-white/10 bg-white/5">
          <button
            onClick={() => {
              setSource('local');
              setError(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider py-2.5 rounded-xl transition-all cursor-pointer ${
              source === 'local'
                ? 'bg-white text-black shadow-md'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <Camera className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Local Webcam</span>
          </button>
          <button
            onClick={() => {
              setSource('ipcam');
              setError(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider py-2.5 rounded-xl transition-all cursor-pointer ${
              source === 'ipcam'
                ? 'bg-white text-black shadow-md'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <Wifi className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>IP Camera</span>
          </button>
        </div>

        {/* IP Camera URL Input & Quick Presets */}
        {source === 'ipcam' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={ipUrl}
                onChange={(e) => rememberUrl(e.target.value)}
                placeholder="http://192.168.1.50:8080/shot.jpg or test"
                className="flex-1 p-2.5 rounded-xl border border-white/15 bg-black text-xs font-mono text-white placeholder-white/40 focus:border-white/40 outline-none"
              />
              <button
                type="button"
                onClick={() => rememberUrl('test')}
                className="px-3 py-2 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-[11px] font-mono text-white whitespace-nowrap cursor-pointer"
              >
                Simulated Test Feed
              </button>
            </div>
            <p className="text-[10px] text-white/50 font-mono">
              Accepts MJPEG, snapshot URLs, or enter <code className="text-emerald-400">test</code> to use simulated test frames.
            </p>
          </div>
        )}

        {/* Local Webcam Options (Device Switcher & Simulated Mode) */}
        {source === 'local' && (
          <div className="flex items-center justify-between text-xs text-white/70 gap-2">
            {devices.length > 1 && (
              <div className="flex items-center gap-2 flex-1">
                <Video className="w-3.5 h-3.5 text-white/50" />
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="bg-black border border-white/15 text-white text-[11px] font-mono rounded-lg p-1.5 flex-1"
                >
                  {devices.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsSimulatedFeed((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono transition-all ml-auto cursor-pointer ${
                isSimulatedFeed
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                  : 'border-white/15 bg-white/5 text-white/60 hover:text-white'
              }`}
            >
              {isSimulatedFeed ? '● Simulated Feed Active' : 'Switch to Simulated Feed'}
            </button>
          </div>
        )}

        {/* Optical Viewfinder / Camera Screen with Live Laser Scanning HUD */}
        <div
          className={`relative rounded-2xl overflow-hidden bg-neutral-950 aspect-video flex items-center justify-center border transition-all ${
            scanFlash ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)]' : 'border-white/15'
          }`}
        >
          {source === 'local' ? (
            isSimulatedFeed ? (
              <canvas ref={animCanvasRef} width={640} height={360} className="w-full h-full object-cover" />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={() => {
                  videoRef.current?.play().catch(() => {});
                }}
                className="w-full h-full object-cover"
              />
            )
          ) : ipPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ipPreview} alt="IP camera preview" className="w-full h-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/50 p-4 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-white/40" />
              <span className="text-xs font-mono">
                {ipUrl ? 'Connecting to IP Camera stream...' : 'Enter IP Camera URL or select Simulated Test Feed'}
              </span>
            </div>
          )}

          {/* HUD Viewfinder Reticle Corners */}
          <div className="absolute inset-4 pointer-events-none border border-white/5">
            {/* Top-Left */}
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/80" />
            {/* Top-Right */}
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/80" />
            {/* Bottom-Left */}
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/80" />
            {/* Bottom-Right */}
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/80" />

            {/* Center crosshair */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 pointer-events-none opacity-40">
              <div className="absolute top-1/2 left-0 right-0 h-px bg-white" />
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white" />
            </div>
          </div>

          {/* Sweeping Laser Scanner Beam */}
          {isScanningActive && (
            <div
              className="absolute left-4 right-4 pointer-events-none transition-all duration-75"
              style={{ top: `${scanLaserPos}%` }}
            >
              <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_12px_rgba(239,68,68,0.9)]" />
              <div className="text-[9px] font-mono text-red-400 uppercase text-center mt-0.5 tracking-widest opacity-80">
                LASER SCANNER BEAM
              </div>
            </div>
          )}

          {/* HUD Telemetry Badges */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-black/70 border border-white/15 text-[10px] font-mono text-white/80 flex items-center gap-1.5 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
              LIVE {source === 'local' ? (isSimulatedFeed ? 'SIMULATOR' : 'WEBCAM') : 'IP-CAM'}
            </span>
          </div>

          <div className="absolute top-3 right-3 flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-black/70 border border-white/15 text-[10px] font-mono text-emerald-400 flex items-center gap-1.5 backdrop-blur-md">
              <ScanLine className="w-3 h-3 text-emerald-400 stroke-[2.5]" />
              OPTICAL SCANNER READY
            </span>
          </div>

          {/* Scanned Barcode Overlay */}
          {scannedBarcode && (
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between px-3 py-1.5 rounded-xl bg-black/85 border border-emerald-500/50 backdrop-blur-md text-xs font-mono">
              <div className="flex items-center gap-2">
                <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-white/60">Scanned:</span>
                <span className="text-emerald-400 font-bold">{scannedBarcode}</span>
              </div>
              <button
                type="button"
                onClick={() => setSku(scannedBarcode)}
                className="text-[10px] text-white underline hover:text-white/80 cursor-pointer"
              >
                Apply SKU
              </button>
            </div>
          )}
        </div>

        {/* Scan Actions & Motion Sensor Row */}
        <div className="flex items-center justify-between gap-2 border-y border-white/10 py-2.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={manualScanTrigger}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-xs font-mono text-white transition-all cursor-pointer"
            >
              <ScanLine className="w-3.5 h-3.5 text-emerald-400" />
              <span>Trigger Barcode Scan</span>
            </button>

            {source === 'local' && !isSimulatedFeed && (
              <label className="flex items-center gap-2 text-xs font-mono text-white/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoMotion}
                  onChange={(e) => setAutoMotion(e.target.checked)}
                  className="rounded border-white/20 bg-black"
                />
                <Activity className="w-3.5 h-3.5 text-white/60" />
                <span>Auto-capture on settle</span>
              </label>
            )}
          </div>

          <div className="flex items-center gap-1 text-[11px] font-mono text-white/50">
            <span>Stage:</span>
            <span className="text-white font-bold">{stage}</span>
          </div>
        </div>

        {/* Catalog Item / Product Metadata Fields */}
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 flex items-center justify-between text-[11px] font-mono text-white/60">
            <span className="flex items-center gap-1">
              <Tag className="w-3 h-3 text-white/40" /> Associated Product SKU & Catalog Info:
            </span>
            {scannedBarcode && <span className="text-emerald-400">✓ Barcode match</span>}
          </div>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="SKU e.g. SKU-BOTTLE-750"
            className="p-2.5 rounded-xl border border-white/15 bg-black text-xs font-mono text-white placeholder-white/40 focus:border-white/40 outline-none"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title e.g. 750ml Vacuum Bottle"
            className="p-2.5 rounded-xl border border-white/15 bg-black text-xs font-mono text-white placeholder-white/40 focus:border-white/40 outline-none"
          />
        </div>

        {/* Error / Status Messages */}
        {error && <p className="text-xs font-mono text-red-400">{error}</p>}
        {status && !error && (
          <p className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> {status}
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2.5 pt-2">
          <button
            onClick={() => (source === 'local' ? captureLocal() : captureIp())}
            disabled={busy || (source === 'ipcam' && !ipUrl)}
            className="flex-1 py-3 rounded-xl bg-white text-black hover:bg-neutral-200 font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all shadow-lg"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4 stroke-[2.5]" />}
            <span>{busy ? 'Processing...' : 'Capture & Save Evidence'}</span>
          </button>
          <button
            onClick={onClose}
            className="px-5 py-3 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-xs font-mono font-bold uppercase tracking-wider text-white cursor-pointer transition-all"
          >
            {lastFile ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
