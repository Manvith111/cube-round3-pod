/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * BarcodeScanner — Real-time auto-detection via:
 *  1. Native BarcodeDetector API (primary — fastest, Chrome/Edge/Android)
 *  2. ZXing BrowserMultiFormatReader (fallback — universal browser support)
 *  3. Canvas-frame polling at 60fps for maximum detection speed
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  Camera,
  Keyboard,
  SwitchCamera,
  CheckCircle2,
  AlertTriangle,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { BarcodeScan, Product, PurchaseOrderLine } from '../types';
import { BarcodeScanResult } from './BarcodeScanResult';

interface BarcodeScannerProps {
  expectedLine: PurchaseOrderLine;
  poNumber: string;
  products: Product[];
  onScanComplete: (scan: BarcodeScan) => void;
  onCancel?: () => void;
  onRequestManagerReview?: () => void;
  onLogException?: (reason: string) => void;
}

// Supported formats for native BarcodeDetector
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code', 'data_matrix'];

// ZXing hints for maximum detection sensitivity
function buildZxingHints() {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.ALSO_INVERTED, true);
  return hints;
}

export function BarcodeScanner({
  expectedLine,
  poNumber,
  products,
  onScanComplete,
  onCancel,
  onRequestManagerReview,
  onLogException,
}: BarcodeScannerProps) {
  const [mode, setMode] = useState<'CAMERA' | 'MANUAL'>('CAMERA');
  const [manualCode, setManualCode] = useState('');
  const [manualFormat, setManualFormat] = useState('EAN_13');

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const [isScanning, setIsScanning] = useState(true);
  const [activeScan, setActiveScan] = useState<BarcodeScan | null>(null);
  const [matchedProduct, setMatchedProduct] = useState<Product | null>(null);
  const [autoAdvance, setAutoAdvance] = useState<number | null>(null);

  // Detection flash state: 'idle' | 'success' | 'fail'
  const [detectionFlash, setDetectionFlash] = useState<'idle' | 'success' | 'fail'>('idle');
  const [scanStatus, setScanStatus] = useState<'searching' | 'detected'>('searching');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const rafIdRef = useRef<number>(0);
  const detectorRef = useRef<any>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const isLockedRef = useRef(false);
  const lastScanRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const isActiveRef = useRef(true);

  // ─── Audio + Haptic feedback ────────────────────────────────────────────────
  const playFeedback = useCallback((success: boolean) => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        if (success) {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1200, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.08);
          gain.gain.setValueAtTime(0.25, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        } else {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(320, ctx.currentTime);
          osc.frequency.linearRampToValueAtTime(200, ctx.currentTime + 0.22);
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        }
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch { /* ignore */ }
    try {
      if ('vibrate' in navigator) navigator.vibrate(success ? [80] : [100, 50, 150]);
    } catch { /* ignore */ }
  }, []);

  // ─── Catalogue lookup ───────────────────────────────────────────────────────
  const evaluateBarcode = useCallback(
    (raw: string, format: string, source: 'CAMERA_SCAN' | 'MANUAL_ENTRY'): { scan: BarcodeScan; product: Product | null } => {
      const val = raw.trim();
      const upper = val.toUpperCase();
      const matched = products.find(
        (p) =>
          (p.gtin && p.gtin.trim() === val) ||
          (p.sku && p.sku.trim().toUpperCase() === upper) ||
          (Array.isArray(p.barcodes) && p.barcodes.some((b) => b.trim() === val))
      ) ?? null;

      let matchStatus: 'PASS' | 'FAIL' | 'UNCERTAIN' = 'UNCERTAIN';
      let resolvedSku = matched?.sku;

      if (matched) {
        matchStatus = matched.sku.toUpperCase() === expectedLine.sku.toUpperCase() ? 'PASS' : 'FAIL';
      } else if (val === expectedLine.gtin || upper === expectedLine.sku.toUpperCase()) {
        matchStatus = 'PASS';
        resolvedSku = expectedLine.sku;
      }

      return {
        scan: {
          id: crypto.randomUUID(),
          barcode_value: val,
          barcode_format: format,
          scan_source: source,
          matched_product_id: matched?.id,
          matched_sku: resolvedSku,
          match_status: matchStatus,
          scanned_at: new Date().toISOString(),
        },
        product: matched,
      };
    },
    [products, expectedLine]
  );

  // ─── Core: handle a decoded barcode value ───────────────────────────────────
  const onBarcodeDetected = useCallback(
    (raw: string, format: string, source: 'CAMERA_SCAN' | 'MANUAL_ENTRY') => {
      const now = Date.now();
      if (isLockedRef.current || now - lastScanRef.current < 700) return;
      isLockedRef.current = true;
      lastScanRef.current = now;

      const { scan, product } = evaluateBarcode(raw, format, source);
      const isPass = scan.match_status === 'PASS';

      playFeedback(isPass);
      setDetectionFlash(isPass ? 'success' : 'fail');
      setScanStatus('detected');
      setTimeout(() => setDetectionFlash('idle'), 600);

      // Stop all ongoing scanning
      cancelAnimationFrame(rafIdRef.current);
      if (controlsRef.current) { try { controlsRef.current.stop(); } catch { /* */ } controlsRef.current = null; }
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); }

      setActiveScan(scan);
      setMatchedProduct(product);
      setIsScanning(false);
      setAutoAdvance(1);
    },
    [evaluateBarcode, playFeedback]
  );

  // ─── Auto-advance countdown ─────────────────────────────────────────────────
  useEffect(() => {
    if (autoAdvance === null || !activeScan) return;
    if (autoAdvance <= 0) { onScanComplete(activeScan); return; }
    const t = setTimeout(() => setAutoAdvance((p) => (p !== null ? p - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [autoAdvance, activeScan, onScanComplete]);

  // ─── Enumerate cameras on mount ─────────────────────────────────────────────
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then((devs) => {
      const cams = devs.filter((d) => d.kind === 'videoinput');
      setVideoDevices(cams);
      const back = cams.find((d) => /back|rear|environment/i.test(d.label));
      setSelectedDeviceId(back?.deviceId ?? cams[0]?.deviceId);
    }).catch(() => {});
  }, []);

  // ─── Main camera + scan engine ──────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'CAMERA' || !isScanning) return;

    isActiveRef.current = true;
    isLockedRef.current = false;
    setCameraError(null);
    setCameraReady(false);
    setScanStatus('searching');

    // Try to build native BarcodeDetector
    let nativeDetector: any = null;
    if ('BarcodeDetector' in window) {
      try { nativeDetector = new (window as any).BarcodeDetector({ formats: NATIVE_FORMATS }); } catch { /* */ }
    }
    detectorRef.current = nativeDetector;

    // Build ZXing reader
    const reader = new BrowserMultiFormatReader(buildZxingHints(), { delayBetweenScanAttempts: 60 });
    readerRef.current = reader;

    async function start() {
      if (!videoRef.current || !isActiveRef.current) return;

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err: any) {
        if (!isActiveRef.current) return;
        // Try simpler constraints as fallback
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch {
          setCameraError(err?.message ?? 'Camera access denied. Use Manual Entry below.');
          setMode('MANUAL');
          return;
        }
      }

      if (!isActiveRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;

      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;

      // Muted + playsInline must be set before play()
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
      try { await videoRef.current.play(); } catch { /* autoplay blocked */ }

      // Check torch
      const track = stream.getVideoTracks()[0];
      if (track) {
        const cap = (track as any).getCapabilities?.();
        setTorchSupported(!!(cap && 'torch' in cap));
      }

      setCameraReady(true);

      // ── Strategy 1: Native BarcodeDetector via canvas polling (fastest) ──────
      if (nativeDetector && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const poll = async () => {
          if (!isActiveRef.current || isLockedRef.current) return;
          const vid = videoRef.current;
          if (!vid || vid.readyState < 2 || vid.videoWidth === 0) {
            rafIdRef.current = requestAnimationFrame(poll);
            return;
          }
          canvas.width = vid.videoWidth;
          canvas.height = vid.videoHeight;
          ctx?.drawImage(vid, 0, 0, canvas.width, canvas.height);
          try {
            const results = await nativeDetector.detect(canvas);
            if (results?.length > 0) {
              const r = results[0];
              onBarcodeDetected(r.rawValue, r.format.toUpperCase(), 'CAMERA_SCAN');
              return; // stop polling after hit
            }
          } catch { /* frame not ready */ }
          rafIdRef.current = requestAnimationFrame(poll);
        };
        rafIdRef.current = requestAnimationFrame(poll);
      }

      // ── Strategy 2: ZXing continuous decode (universal fallback) ─────────────
      try {
        const controls = await reader.decodeFromVideoElement(videoRef.current, (result) => {
          if (!isActiveRef.current || !result) return;
          const text = result.getText();
          const fmt = BarcodeFormat[result.getBarcodeFormat()] ?? 'CODE_128';
          onBarcodeDetected(text, fmt, 'CAMERA_SCAN');
        });
        if (isActiveRef.current) controlsRef.current = controls;
        else try { controls.stop(); } catch { /* */ }
      } catch { /* decoding init failed */ }
    }

    start();

    return () => {
      isActiveRef.current = false;
      cancelAnimationFrame(rafIdRef.current);
      if (controlsRef.current) { try { controlsRef.current.stop(); } catch { /* */ } controlsRef.current = null; }
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    };
  }, [mode, isScanning, selectedDeviceId, onBarcodeDetected]);

  // ─── Torch toggle ───────────────────────────────────────────────────────────
  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await (track as any).applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch { /* torch not available */ }
  };

  // ─── Camera cycle ───────────────────────────────────────────────────────────
  const cycleCamera = () => {
    if (videoDevices.length < 2) return;
    const idx = videoDevices.findIndex((d) => d.deviceId === selectedDeviceId);
    setSelectedDeviceId(videoDevices[(idx + 1) % videoDevices.length].deviceId);
  };

  // ─── Manual submit ──────────────────────────────────────────────────────────
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCode.trim();
    if (!clean) return;
    let fmt = manualFormat;
    if (/^\d{13}$/.test(clean)) fmt = 'EAN_13';
    else if (/^\d{12}$/.test(clean)) fmt = 'UPC_A';
    else if (/^\d{8}$/.test(clean)) fmt = 'EAN_8';
    onBarcodeDetected(clean, fmt, 'MANUAL_ENTRY');
  };

  // ─── Rescan ─────────────────────────────────────────────────────────────────
  const handleRescan = () => {
    setActiveScan(null);
    setMatchedProduct(null);
    setManualCode('');
    setAutoAdvance(null);
    setScanStatus('searching');
    isLockedRef.current = false;
    setIsScanning(true);
  };

  // ─── Viewfinder border color ─────────────────────────────────────────────────
  const reticleBorderClass =
    detectionFlash === 'success'
      ? 'border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.7)]'
      : detectionFlash === 'fail'
      ? 'border-rose-400 shadow-[0_0_24px_rgba(251,113,133,0.7)]'
      : 'border-cyan-400/80 shadow-[0_0_12px_rgba(6,182,212,0.25)]';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden text-xs font-sans">
      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="font-bold text-white">Auto Barcode Scanner</div>
            <div className="text-[11px] text-slate-400">
              SKU: <span className="font-mono text-cyan-400">{expectedLine.sku}</span>
              {' · '}GTIN: <span className="font-mono text-slate-300">{expectedLine.gtin || 'Any'}</span>
            </div>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-lg p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => { setMode('CAMERA'); if (!activeScan) setIsScanning(true); }}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${mode === 'CAMERA' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <Camera className="w-3 h-3" /> Camera
          </button>
          <button
            type="button"
            onClick={() => { setMode('MANUAL'); setIsScanning(false); }}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${mode === 'MANUAL' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <Keyboard className="w-3 h-3" /> Manual
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-4">

        {/* ── RESULT VIEW ── */}
        {activeScan ? (
          <div className="space-y-3">
            {autoAdvance !== null && (
              <div className="p-3 rounded-xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-between">
                <div className="flex items-center gap-2 text-cyan-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Barcode captured! Advancing in <strong>{autoAdvance}s</strong>…</span>
                </div>
                <button
                  type="button"
                  onClick={() => onScanComplete(activeScan)}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-3 py-1 rounded-lg text-xs cursor-pointer"
                >
                  Continue →
                </button>
              </div>
            )}
            <BarcodeScanResult
              scan={activeScan}
              expectedLine={expectedLine}
              poNumber={poNumber}
              matchedProduct={matchedProduct}
              onConfirm={() => onScanComplete(activeScan)}
              onRescan={handleRescan}
              onManualFallback={() => { setActiveScan(null); setMode('MANUAL'); }}
              onRequestManagerReview={onRequestManagerReview}
              onLogException={onLogException}
            />
          </div>

        ) : mode === 'CAMERA' ? (

          /* ── CAMERA VIEWFINDER ── */
          <div className="space-y-3">

            {/* Hidden canvas for frame capture */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Video + overlay */}
            <div className={`relative aspect-video max-h-80 w-full bg-black rounded-xl overflow-hidden border-2 transition-all duration-200 ${reticleBorderClass}`}>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover"
              />

              {/* ── OVERLAY: dim surrounds + scanning reticle ── */}
              {cameraReady && (
                <div className="absolute inset-0 pointer-events-none">
                  {/* Dim mask around the centre box */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative w-64 h-40">
                      {/* Semi-transparent masks */}
                      <div className="absolute -inset-x-[9999px] top-0 bottom-0 bg-black/50" />
                      <div className="absolute inset-0 bg-transparent" />

                      {/* Reticle box */}
                      <div className={`absolute inset-0 border-2 rounded-lg transition-all duration-200 ${reticleBorderClass}`}>
                        {/* Corner brackets */}
                        <span className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-cyan-300 rounded-tl" />
                        <span className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-cyan-300 rounded-tr" />
                        <span className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-cyan-300 rounded-bl" />
                        <span className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-cyan-300 rounded-br" />

                        {/* ── ANIMATED LASER SWEEP ── */}
                        <div
                          className="absolute left-1 right-1"
                          style={{ animation: 'laserSweep 1.6s ease-in-out infinite' }}
                        >
                          <div className="h-[2px] bg-gradient-to-r from-transparent via-rose-500 to-transparent opacity-90 shadow-[0_0_6px_2px_rgba(244,63,94,0.7)]" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Status pill */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full backdrop-blur-md text-[11px] font-semibold border ${
                      scanStatus === 'detected'
                        ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-300'
                        : 'bg-slate-950/80 border-slate-700/80 text-cyan-300'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${scanStatus === 'detected' ? 'bg-emerald-400' : 'bg-emerald-400 animate-ping'}`} />
                      {scanStatus === 'detected' ? 'Barcode detected!' : 'Point camera at barcode'}
                    </div>
                  </div>
                </div>
              )}

              {/* Camera not ready spinner */}
              {!cameraReady && !cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 bg-black/60">
                  <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Starting camera…</span>
                </div>
              )}

              {/* Top-right: torch + camera switch */}
              <div className="absolute top-2.5 right-2.5 flex gap-2">
                {torchSupported && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    title={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
                    className={`p-2 rounded-full border backdrop-blur-sm transition cursor-pointer ${torchOn ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-900/80 text-white border-slate-700 hover:bg-slate-800'}`}
                  >
                    {/* Flash icon text fallback */}
                    <span className="text-[10px] font-bold">{torchOn ? '💡' : '🔦'}</span>
                  </button>
                )}
                {videoDevices.length > 1 && (
                  <button
                    type="button"
                    onClick={cycleCamera}
                    title="Switch camera"
                    className="p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700 backdrop-blur-sm transition cursor-pointer"
                  >
                    <SwitchCamera className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Scanning continuously · ZXing + Native BarcodeDetector</span>
              </div>
              <button
                type="button"
                onClick={() => setMode('MANUAL')}
                className="text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
              >
                Manual entry →
              </button>
            </div>
          </div>

        ) : (

          /* ── MANUAL ENTRY ── */
          <div className="space-y-4 py-1">
            {cameraError && (
              <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-xs mb-0.5">Camera unavailable</div>
                  <p className="text-[11px] opacity-90">{cameraError}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleManualSubmit} className="space-y-4 max-w-sm mx-auto">
              <div className="text-center">
                <div className="text-xs font-bold text-white mb-1">Manual Barcode Entry</div>
                <p className="text-[11px] text-slate-400">
                  Type the barcode digits printed below the bars on the carton label.
                </p>
              </div>

              {/* Expected GTIN hint */}
              {expectedLine.gtin && (
                <button
                  type="button"
                  onClick={() => setManualCode(expectedLine.gtin)}
                  className="w-full p-2.5 bg-cyan-950/30 border border-cyan-500/30 rounded-xl text-center cursor-pointer hover:bg-cyan-950/50 transition"
                >
                  <div className="text-[10px] text-slate-500 mb-0.5">Expected GTIN — tap to fill</div>
                  <div className="font-mono text-cyan-300 font-bold tracking-widest text-sm">{expectedLine.gtin}</div>
                </button>
              )}

              <div className="space-y-2">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="e.g. 08901234567890"
                  autoFocus
                  inputMode="numeric"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3.5 text-center text-base font-mono text-white tracking-[0.18em] focus:outline-none shadow-inner transition"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Format:</span>
                  <select
                    value={manualFormat}
                    onChange={(e) => setManualFormat(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-slate-200 rounded px-2 py-1 text-[10px] font-mono focus:outline-none"
                  >
                    <option value="EAN_13">EAN-13 (Retail)</option>
                    <option value="UPC_A">UPC-A (North America)</option>
                    <option value="CODE_128">Code 128 (Logistics)</option>
                    <option value="GTIN_14">GTIN-14 (Carton)</option>
                    <option value="CODE_39">Code 39</option>
                    <option value="QR_CODE">QR Code</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setMode('CAMERA'); setIsScanning(true); }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl font-semibold transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Try Camera
                </button>
                <button
                  type="submit"
                  disabled={!manualCode.trim()}
                  className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 rounded-xl transition cursor-pointer disabled:opacity-40"
                >
                  Verify →
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* CSS for laser sweep animation */}
      <style>{`
        @keyframes laserSweep {
          0%   { top: 4px;   opacity: 0.3; }
          10%  { opacity: 1; }
          50%  { top: calc(100% - 4px); opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 4px;   opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
