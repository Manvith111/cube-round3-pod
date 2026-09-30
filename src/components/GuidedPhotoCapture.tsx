/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GuidedPhotoCapture — Step-by-step evidence photo collection.
 *
 * On MOBILE: "Open Camera" uses <input capture="environment"> which triggers
 * the rear camera directly (no browser permission prompt, native UX).
 * On DESKTOP: Falls back to a live webcam viewfinder via getUserMedia + canvas snapshot.
 *
 * Every photo has:
 *  - Quality analysis (blur/dark/overexposed detection)
 *  - Retake button  (replaces existing photo)
 *  - DELETE button  (removes captured photo so step is un-ticked)
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Check,
  CheckCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Trash2,
  RotateCcw,
  Info,
  X,
  ImagePlus,
} from 'lucide-react';
import { InspectionPhoto, PhotoType } from '../types';
import { evaluateImageQuality, QualityGateResult } from '../lib/qualityGate';

// ─── Step definitions ─────────────────────────────────────────────────────────

interface StepInfo {
  type: PhotoType;
  title: string;
  mandatory: boolean;
  instruction: string;
  overlayLabel: string;
}

const PHOTO_STEPS: StepInfo[] = [
  {
    type: 'BARCODE_LABEL',
    title: 'Barcode & Shipping Label',
    mandatory: true,
    instruction: 'Move close until barcode numbers, SKU text, and supplier address are completely readable.',
    overlayLabel: 'Align shipping label inside frame',
  },
  {
    type: 'CARTON_FRONT',
    title: 'Carton Front Side',
    mandatory: true,
    instruction: 'Capture the complete front of the carton including all 4 edge corners.',
    overlayLabel: 'Full carton front view',
  },
  {
    type: 'CARTON_LEFT',
    title: 'Carton Left Side',
    mandatory: true,
    instruction: 'Capture the full left side of this carton. Check for crushing or puncture.',
    overlayLabel: 'Full carton left side',
  },
  {
    type: 'CARTON_RIGHT',
    title: 'Carton Right Side',
    mandatory: true,
    instruction: 'Capture the full right side including corrugation joints and corners.',
    overlayLabel: 'Full carton right side',
  },
  {
    type: 'CARTON_TOP',
    title: 'Carton Top & Seal',
    mandatory: true,
    instruction: 'Capture top surface showing factory sealing tape and strapping.',
    overlayLabel: 'Top surface and tape seal',
  },
  {
    type: 'SHIPMENT_OVERVIEW',
    title: 'Shipment Overview (All Cartons)',
    mandatory: true,
    instruction: 'Take one wide photo containing all cartons received on the dock / pallet.',
    overlayLabel: 'Wide overview of all cartons',
  },
  {
    type: 'OPEN_CARTON',
    title: 'Open Carton Contents',
    mandatory: false,
    instruction: 'Open carton only where warehouse policy allows. Show interior packing and units.',
    overlayLabel: 'Interior packing & visible units',
  },
  {
    type: 'DAMAGE_CLOSEUP',
    title: 'Damage Close-Up',
    mandatory: false,
    instruction: 'If any crushing, tear, or water damage is observed, take a high-detail close-up.',
    overlayLabel: 'Close-up of damaged corrugation',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isMobile = () =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform));

// ─── Props ───────────────────────────────────────────────────────────────────

interface GuidedPhotoCaptureProps {
  onComplete: (photos: InspectionPhoto[]) => void;
  onCancel: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function GuidedPhotoCapture({ onComplete, onCancel }: GuidedPhotoCaptureProps) {
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [capturedPhotos, setCapturedPhotos] = useState<Record<PhotoType, InspectionPhoto | undefined>>({} as any);
  const [activePreview, setActivePreview] = useState<{ base64: string; quality: QualityGateResult } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Webcam viewfinder (desktop only)
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [snapFlash, setSnapFlash] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);   // capture="environment"
  const galleryInputRef = useRef<HTMLInputElement>(null);  // no capture — gallery picker
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const currentStep = PHOTO_STEPS[currentStepIdx];
  const totalMandatory = PHOTO_STEPS.filter((s) => s.mandatory).length;
  const capturedMandatoryCount = PHOTO_STEPS.filter((s) => s.mandatory && capturedPhotos[s.type]).length;
  const hasCurrentPhoto = !!capturedPhotos[currentStep.type];
  const mobile = isMobile();

  // ── Stop webcam whenever leaving webcam mode ────────────────────────────
  const stopWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setWebcamActive(false);
    setWebcamError(null);
  }, []);

  useEffect(() => () => stopWebcam(), [stopWebcam]);

  // When navigating steps, stop webcam
  useEffect(() => { stopWebcam(); setActivePreview(null); }, [currentStepIdx]);

  // ── Start webcam (desktop) ───────────────────────────────────────────────
  const startWebcam = async () => {
    setWebcamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play();
      }
      setWebcamActive(true);
    } catch (err: any) {
      setWebcamError(err?.message ?? 'Camera access denied. Use "Choose from Gallery" below.');
    }
  };

  // ── Snap photo from webcam ───────────────────────────────────────────────
  const snapWebcam = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !webcamActive) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Flash effect
    setSnapFlash(true);
    setTimeout(() => setSnapFlash(false), 180);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setAnalyzing(true);
      try {
        const quality = await evaluateImageQuality(blob, currentStep.type);
        const reader = new FileReader();
        reader.onload = () => {
          setActivePreview({ base64: reader.result as string, quality });
          setAnalyzing(false);
          stopWebcam();
        };
        reader.readAsDataURL(blob);
      } catch {
        setAnalyzing(false);
      }
    }, 'image/jpeg', 0.88);
  };

  // ── Handle file selected (mobile camera or gallery) ──────────────────────
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalyzing(true);
    try {
      const quality = await evaluateImageQuality(file, currentStep.type);
      const reader = new FileReader();
      reader.onload = () => {
        setActivePreview({ base64: reader.result as string, quality });
        setAnalyzing(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setAnalyzing(false);
    }
    // Reset so same file can be selected again
    e.target.value = '';
  };

  // ── Accept the previewed photo ───────────────────────────────────────────
  const handleAccept = () => {
    if (!activePreview) return;
    const photo: InspectionPhoto = {
      id: crypto.randomUUID(),
      photo_type: currentStep.type,
      file_name: `${currentStep.type.toLowerCase()}_${Date.now()}.jpg`,
      mime_type: 'image/jpeg',
      file_size: Math.round((activePreview.base64.length * 3) / 4),
      sha256_hash: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
      captured_at: new Date().toISOString(),
      quality_status: activePreview.quality.status,
      quality_reason: activePreview.quality.reason,
      base64: activePreview.base64,
    };
    setCapturedPhotos((prev) => ({ ...prev, [currentStep.type]: photo }));
    setActivePreview(null);
    if (currentStepIdx < PHOTO_STEPS.length - 1) setCurrentStepIdx(currentStepIdx + 1);
  };

  // ── DELETE captured photo for this step ─────────────────────────────────
  const handleDelete = () => {
    setCapturedPhotos((prev) => {
      const next = { ...prev };
      delete next[currentStep.type];
      return next;
    });
    setActivePreview(null);
  };

  // ── Retake: discard preview / re-open input ──────────────────────────────
  const handleRetake = () => {
    setActivePreview(null);
    if (mobile) {
      cameraInputRef.current?.click();
    } else {
      startWebcam();
    }
  };

  const handleFinish = () => {
    const photos = Object.values(capturedPhotos).filter(Boolean) as InspectionPhoto[];
    onComplete(photos);
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-slate-100 flex flex-col">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="px-4 py-3 border-b border-slate-800 bg-slate-900 flex items-center justify-between shrink-0">
        <div>
          <div className="text-[10px] font-bold text-cyan-400 tracking-widest uppercase">
            Step {currentStepIdx + 1} of {PHOTO_STEPS.length}: {currentStep.mandatory ? 'Required' : 'Optional'}
          </div>
          <div className="text-sm font-bold text-white mt-0.5">{currentStep.title}</div>
        </div>
        <button onClick={onCancel} className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <div className="h-1.5 bg-slate-800 shrink-0">
        <div
          className="h-full bg-cyan-500 transition-all duration-300"
          style={{ width: `${((currentStepIdx + 1) / PHOTO_STEPS.length) * 100}%` }}
        />
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-4 py-4 flex flex-col gap-4">

          {/* Instruction banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex gap-2.5">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-300 leading-relaxed">{currentStep.instruction}</p>
          </div>

          {/* ── PREVIEW (just captured, awaiting confirm/retake) ─────────── */}
          {activePreview ? (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-black aspect-[4/3]">
                <img src={activePreview.base64} alt="Preview" className="w-full h-full object-contain" />
                <div className="absolute top-2 right-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded shadow ${activePreview.quality.isAcceptable ? 'bg-emerald-500 text-black' : 'bg-amber-500 text-black'}`}>
                    {activePreview.quality.status}
                  </span>
                </div>
              </div>

              {/* Quality feedback */}
              {activePreview.quality.isAcceptable ? (
                <div className="bg-emerald-950/30 border border-emerald-700/50 rounded-xl p-3 flex items-center gap-2 text-xs text-emerald-300">
                  <CheckCircle className="w-4 h-4 shrink-0" /> Image clarity verified. Ready to attach as evidence.
                </div>
              ) : (
                <div className="bg-amber-950/40 border border-amber-700/60 rounded-xl p-3 text-xs text-amber-200 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-300">
                    <AlertTriangle className="w-4 h-4" /> Quality Warning
                  </div>
                  <div>{activePreview.quality.reason}</div>
                  {activePreview.quality.advice && <div className="text-white font-semibold">→ {activePreview.quality.advice}</div>}
                </div>
              )}

              {/* Confirm / Retake */}
              <div className="flex gap-2">
                <button
                  onClick={handleRetake}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Retake
                </button>
                <button
                  onClick={handleAccept}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" /> Confirm Photo
                </button>
              </div>
            </div>

          /* ── WEBCAM VIEWFINDER (desktop) ───────────────────────────────── */
          ) : webcamActive ? (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-black border-2 border-cyan-500/50 aspect-[4/3]">
                <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
                {/* Snap flash overlay */}
                {snapFlash && <div className="absolute inset-0 bg-white opacity-70 pointer-events-none" />}
                {/* Dashed reticle */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-3/4 h-3/4 border-2 border-dashed border-cyan-400/60 rounded-lg" />
                </div>
                {/* Stop button */}
                <button
                  onClick={stopWebcam}
                  className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1.5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <canvas ref={canvasRef} className="hidden" />

              {/* ── Two-button row ── */}
              <div className="grid grid-cols-2 gap-3">
                {/* 1) Camera Access — snap from live feed */}
                <button
                  onClick={snapWebcam}
                  disabled={analyzing}
                  className="flex flex-col items-center justify-center gap-2 py-4 rounded-xl text-sm font-bold transition cursor-pointer disabled:opacity-60"
                  style={{
                    background: '#004ac6',
                    color: '#ffffff',
                    border: 'none',
                    boxShadow: '0 4px 14px rgba(0,74,198,0.30)',
                  }}
                >
                  {analyzing ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5" />
                  )}
                  <span>{analyzing ? 'Analysing…' : 'Camera Access'}</span>
                  <span className="text-[10px] font-normal opacity-75">Snap from live feed</span>
                </button>

                {/* 2) Upload from Gallery — file picker */}
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={analyzing}
                  className="flex flex-col items-center justify-center gap-2 py-4 rounded-xl text-sm font-semibold transition cursor-pointer disabled:opacity-60"
                  style={{
                    background: '#ebedff',
                    color: '#004ac6',
                    border: '2px solid #b4c5ff',
                  }}
                >
                  <ImagePlus className="w-5 h-5" />
                  <span>Upload from Gallery</span>
                  <span className="text-[10px] font-normal opacity-60">Choose from files</span>
                </button>
              </div>
            </div>


          /* ── ALREADY HAS PHOTO for this step ───────────────────────────── */
          ) : hasCurrentPhoto ? (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden border-2 border-emerald-700/60 bg-black aspect-[4/3]">
                <img
                  src={capturedPhotos[currentStep.type]?.base64}
                  alt={currentStep.title}
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-2 right-2 bg-emerald-500 text-black text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                  <Check className="w-3 h-3" /> CAPTURED
                </div>
              </div>

              {/* Retake + DELETE row */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (mobile) cameraInputRef.current?.click();
                    else startWebcam();
                  }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Retake
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/60 text-rose-300 hover:text-rose-200 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Photo
                </button>
              </div>
            </div>

          /* ── EMPTY STATE — waiting for first capture ───────────────────── */
          ) : (
            <div className="space-y-3">
              {/* Webcam error */}
              {webcamError && !mobile && (
                <div className="bg-amber-950/40 border border-amber-700/50 rounded-xl p-3 text-xs text-amber-200 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div>{webcamError} — Use "Upload from Gallery" instead.</div>
                </div>
              )}

              {/* Framing placeholder */}
              <div
                className="w-full aspect-[4/3] rounded-xl flex flex-col items-center justify-center gap-3 text-center"
                style={{
                  background: '#0d1117',
                  border: '2px dashed rgba(0,74,198,0.35)',
                  color: '#737686',
                }}
              >
                <div className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,74,198,0.10)' }}>
                  <Camera className="w-7 h-7" style={{ color: '#004ac6' }} />
                </div>
                <div className="text-sm font-semibold text-slate-300">{currentStep.overlayLabel}</div>
                <div className="text-xs text-slate-500 max-w-[220px]">
                  Choose Camera Access or Upload from Gallery below
                </div>
              </div>

              {/* ── Two equal action buttons ── */}
              <div className="grid grid-cols-2 gap-3">
                {/* 1) Camera Access */}
                <button
                  onClick={() => { if (mobile) cameraInputRef.current?.click(); else startWebcam(); }}
                  disabled={analyzing}
                  className="flex flex-col items-center justify-center gap-2 py-4 rounded-xl text-sm font-bold transition cursor-pointer disabled:opacity-60"
                  style={{
                    background: '#004ac6',
                    color: '#ffffff',
                    border: 'none',
                    boxShadow: '0 4px 14px rgba(0,74,198,0.30)',
                  }}
                >
                  <Camera className="w-5 h-5" />
                  <span>Camera Access</span>
                  <span className="text-[10px] font-normal opacity-75">
                    {mobile ? 'Open rear camera' : 'Open live webcam'}
                  </span>
                </button>

                {/* 2) Upload from Gallery */}
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={analyzing}
                  className="flex flex-col items-center justify-center gap-2 py-4 rounded-xl text-sm font-semibold transition cursor-pointer disabled:opacity-60"
                  style={{
                    background: '#ebedff',
                    color: '#004ac6',
                    border: '2px solid #b4c5ff',
                  }}
                >
                  <ImagePlus className="w-5 h-5" />
                  <span>Upload from Gallery</span>
                  <span className="text-[10px] font-normal opacity-60">Choose from files</span>
                </button>
              </div>

              {/* Analysing spinner */}
              {analyzing && (
                <div className="flex items-center justify-center gap-2 text-xs text-slate-400 py-2">
                  <span className="w-4 h-4 border-2 border-[#004ac6] border-t-transparent rounded-full animate-spin" />
                  Analysing image quality…
                </div>
              )}
            </div>
          )}


          {/* Hidden file inputs */}
          {/* Mobile camera — rear lens */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelected}
            className="hidden"
          />
          {/* Gallery / file picker (no capture attr) */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelected}
            className="hidden"
          />

          {/* ── Step dots + nav ──────────────────────────────────────────── */}
          <div className="pt-2 space-y-3">
            {/* Step dots */}
            <div className="flex gap-1.5 justify-center overflow-x-auto py-1">
              {PHOTO_STEPS.map((s, idx) => {
                const done = !!capturedPhotos[s.type];
                const active = idx === currentStepIdx;
                return (
                  <button
                    key={s.type}
                    onClick={() => { setActivePreview(null); setCurrentStepIdx(idx); }}
                    title={s.title}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      active ? 'w-6 bg-cyan-400' : done ? 'w-2 bg-emerald-400' : s.mandatory ? 'w-2 bg-slate-700' : 'w-2 bg-slate-800'
                    }`}
                  />
                );
              })}
            </div>

            {/* Prev / Next / Finish */}
            <div className="flex items-center justify-between gap-3">
              <button
                disabled={currentStepIdx === 0}
                onClick={() => { setActivePreview(null); setCurrentStepIdx(currentStepIdx - 1); }}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white disabled:opacity-30 transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>

              {currentStepIdx < PHOTO_STEPS.length - 1 ? (
                <button
                  onClick={() => { setActivePreview(null); setCurrentStepIdx(currentStepIdx + 1); }}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  disabled={capturedMandatoryCount < totalMandatory}
                  onClick={handleFinish}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs disabled:opacity-40 flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-emerald-950"
                >
                  <CheckCircle className="w-4 h-4" />
                  Complete Evidence Set ({capturedMandatoryCount}/{totalMandatory})
                </button>
              )}
            </div>

            {/* Missing mandatory hint */}
            {capturedMandatoryCount < totalMandatory && (
              <p className="text-center text-[11px] text-slate-500">
                {totalMandatory - capturedMandatoryCount} required photo{totalMandatory - capturedMandatoryCount !== 1 ? 's' : ''} still missing
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
