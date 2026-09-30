import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  Scan,
  QrCode,
  Barcode,
  Camera,
  CameraOff,
  Flashlight,
  FlashlightOff,
  SwitchCamera,
  Keyboard,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Package,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Layers,
  Sparkles,
  Volume2,
  VolumeX,
  UploadCloud,
  Check,
  Zap,
} from 'lucide-react';
import { PurchaseOrder, PurchaseOrderLine, Product, BarcodeScan } from '../types';
import { ProductMatchCard } from '../components/ProductMatchCard';
import { parseQrPayload, ParsedQrPayload } from '../lib/qrPayloadParser';

declare global {
  interface Window {
    BarcodeDetector?: any;
  }
}

interface InspectionScanPageProps {
  inspectionId: string;
  po: PurchaseOrder;
  line: PurchaseOrderLine;
  products: Product[];
  onScanSaved: (scan: BarcodeScan) => void;
  onContinueToPhotos: () => void;
  onBack: () => void;
  onRequestManagerReview?: () => void;
  onLogException?: (reason: string) => void;
}

type ScanMode = 'DUAL' | 'QR_ONLY' | 'BARCODE_1D' | 'MANUAL';

export function InspectionScanPage({
  inspectionId,
  po,
  line,
  products,
  onScanSaved,
  onContinueToPhotos,
  onBack,
  onRequestManagerReview,
  onLogException,
}: InspectionScanPageProps) {
  // Allow switching active line if scanned QR matches another PO line
  const [activeLine, setActiveLine] = useState<PurchaseOrderLine>(line);

  // Scanner UI modes
  const [scanMode, setScanMode] = useState<ScanMode>('DUAL');
  const [manualInput, setManualInput] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Camera devices & controls
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Real-time detection state
  const [isScanning, setIsScanning] = useState(true);
  const [completedScan, setCompletedScan] = useState<BarcodeScan | null>(null);
  const [parsedQr, setParsedQr] = useState<ParsedQrPayload | null>(null);
  const [matchedProduct, setMatchedProduct] = useState<Product | null>(null);
  const [hardwareAccelerationActive, setHardwareAccelerationActive] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanTimestampRef = useRef<number>(0);
  const isLockedRef = useRef<boolean>(false);
  const nativeDetectorRef = useRef<any>(null);
  const nativeDetectAnimFrameRef = useRef<number | null>(null);

  // Audio feedback
  const playAudioFeedback = useCallback(
    (isSuccess: boolean) => {
      if (!soundEnabled) return;
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        if (isSuccess) {
          // Clean double chime
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1050, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(1750, ctx.currentTime + 0.08);
          gain.gain.setValueAtTime(0.25, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.16);
        } else {
          // Warning buzz
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(300, ctx.currentTime);
          osc.frequency.linearRampToValueAtTime(200, ctx.currentTime + 0.22);
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        }

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + (isSuccess ? 0.16 : 0.25));
      } catch {
        // audio context muted or user hasn't interacted
      }

      // Haptic vibration
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          if (isSuccess) {
            navigator.vibrate(75);
          } else {
            navigator.vibrate([100, 60, 150]);
          }
        } catch {}
      }
    },
    [soundEnabled]
  );

  // Real catalogue lookup & PO line cross-reference engine
  const evaluateScannedCode = useCallback(
    (
      rawVal: string,
      format: string,
      source: 'CAMERA_SCAN' | 'MANUAL_ENTRY'
    ): { scan: BarcodeScan; product: Product | null; parsed: ParsedQrPayload } => {
      // Parse potential structured QR payload (JSON, GS1 Digital Link, or Delimited)
      const parsed = parseQrPayload(rawVal);

      // Search keys: prioritize extracted SKU/GTIN from QR, fallback to raw value
      const targetSku = (parsed.extractedSku || parsed.raw).trim().toUpperCase();
      const targetGtin = parsed.extractedGtin?.trim() || parsed.raw.trim();

      // Search warehouse catalog
      const matched =
        products.find((p) => {
          if (targetGtin && p.gtin && p.gtin.trim() === targetGtin) return true;
          if (targetSku && p.sku && p.sku.trim().toUpperCase() === targetSku) return true;
          if (p.barcodes && Array.isArray(p.barcodes)) {
            return p.barcodes.some((b) => b.trim() === targetGtin || b.trim() === rawVal.trim());
          }
          return false;
        }) || null;

      let matchStatus: 'PASS' | 'FAIL' | 'UNCERTAIN' = 'UNCERTAIN';
      let resolvedSku = matched?.sku || parsed.extractedSku;

      // Check match against active PO line
      const activeLineSkuUpper = activeLine.sku.trim().toUpperCase();
      const activeLineGtin = activeLine.gtin?.trim();

      if (
        targetSku === activeLineSkuUpper ||
        (targetGtin && activeLineGtin && targetGtin === activeLineGtin) ||
        (matched && matched.sku.toUpperCase() === activeLineSkuUpper)
      ) {
        matchStatus = 'PASS';
        resolvedSku = activeLine.sku;
      } else if (matched) {
        // Matched a catalog item that is NOT this line
        matchStatus = 'FAIL';
      } else if (rawVal.trim() === activeLineGtin || rawVal.trim().toUpperCase() === activeLineSkuUpper) {
        matchStatus = 'PASS';
        resolvedSku = activeLine.sku;
      } else {
        matchStatus = 'UNCERTAIN';
      }

      const scanRecord: BarcodeScan = {
        id: crypto.randomUUID(),
        inspection_id: inspectionId,
        barcode_value: rawVal.trim(),
        barcode_format: format,
        scan_source: source,
        matched_product_id: matched?.id,
        matched_sku: resolvedSku,
        match_status: matchStatus,
        scanned_at: new Date().toISOString(),
      };

      return { scan: scanRecord, product: matched, parsed };
    },
    [products, activeLine, inspectionId]
  );

  // Stop camera tracks cleanly
  const stopCameraStreams = useCallback(() => {
    if (nativeDetectAnimFrameRef.current) {
      cancelAnimationFrame(nativeDetectAnimFrameRef.current);
      nativeDetectAnimFrameRef.current = null;
    }
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {}
      controlsRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
  }, []);

  // Process detected code safely with debouncing & state updates
  const handleCodeDetected = useCallback(
    (rawValue: string, formatName: string, source: 'CAMERA_SCAN' | 'MANUAL_ENTRY') => {
      const now = Date.now();
      if (now - lastScanTimestampRef.current < 1200 || isLockedRef.current) {
        return;
      }
      lastScanTimestampRef.current = now;
      isLockedRef.current = true;

      const { scan, product, parsed } = evaluateScannedCode(rawValue, formatName, source);

      playAudioFeedback(scan.match_status === 'PASS');
      setCompletedScan(scan);
      setMatchedProduct(product);
      setParsedQr(parsed);
      setIsScanning(false);
      onScanSaved(scan);

      stopCameraStreams();
    },
    [evaluateScannedCode, playAudioFeedback, onScanSaved, stopCameraStreams]
  );

  // Enumerate cameras on mount
  useEffect(() => {
    async function loadCameras() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return;
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setVideoDevices(videoInputs);

        // Auto-select rear/environment camera
        const backCamera = videoInputs.find(
          (d) =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('environment')
        );
        if (backCamera) {
          setSelectedDeviceId(backCamera.deviceId);
        } else if (videoInputs.length > 0) {
          setSelectedDeviceId(videoInputs[0].deviceId);
        }
      } catch (err) {
        console.warn('Camera enumeration error:', err);
      }
    }
    loadCameras();
  }, []);

  // Native BarcodeDetector loop for 60fps hardware accelerated QR/Barcode detection
  const startNativeDetectionLoop = useCallback(
    (videoEl: HTMLVideoElement, detector: any) => {
      let isRunning = true;

      async function detectFrame() {
        if (!isRunning || !videoEl || videoEl.readyState < 2 || isLockedRef.current) {
          if (isRunning) {
            nativeDetectAnimFrameRef.current = requestAnimationFrame(detectFrame);
          }
          return;
        }

        try {
          const detectedCodes = await detector.detect(videoEl);
          if (detectedCodes && detectedCodes.length > 0 && !isLockedRef.current) {
            const code = detectedCodes[0];
            const raw = code.rawValue || '';
            const fmt = (code.format || 'QR_CODE').toUpperCase();

            // Filter according to scanMode
            if (scanMode === 'QR_ONLY' && !fmt.includes('QR') && !fmt.includes('MATRIX')) {
              // Ignore non-2D codes in QR-only mode
            } else if (scanMode === 'BARCODE_1D' && (fmt.includes('QR') || fmt.includes('MATRIX'))) {
              // Ignore 2D codes in 1D-only mode
            } else if (raw.trim()) {
              isRunning = false;
              handleCodeDetected(raw, fmt, 'CAMERA_SCAN');
              return;
            }
          }
        } catch {
          // Frame decode exception; continue
        }

        if (isRunning) {
          nativeDetectAnimFrameRef.current = requestAnimationFrame(detectFrame);
        }
      }

      nativeDetectAnimFrameRef.current = requestAnimationFrame(detectFrame);

      return () => {
        isRunning = false;
        if (nativeDetectAnimFrameRef.current) {
          cancelAnimationFrame(nativeDetectAnimFrameRef.current);
          nativeDetectAnimFrameRef.current = null;
        }
      };
    },
    [scanMode, handleCodeDetected]
  );

  // Initialize camera scanner stream & engine
  useEffect(() => {
    if (scanMode === 'MANUAL' || !isScanning) {
      stopCameraStreams();
      return;
    }

    isLockedRef.current = false;
    setCameraError(null);

    let isSubscribed = true;
    let stopNativeLoop: (() => void) | null = null;

    async function initScanner() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera access not supported on this browser or platform.');
        return;
      }

      try {
        const constraints: MediaStreamConstraints = {
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId } }
            : {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!isSubscribed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();

          // Check torch capability
          const track = stream.getVideoTracks()[0];
          if (track) {
            const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined;
            setTorchSupported(Boolean(capabilities?.torch));
          }
        }

        // 1. Try Native BarcodeDetector (Hardware Accelerated 60 FPS)
        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
          try {
            const formats =
              scanMode === 'QR_ONLY'
                ? ['qr_code', 'data_matrix', 'aztec']
                : scanMode === 'BARCODE_1D'
                ? ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf']
                : ['qr_code', 'data_matrix', 'aztec', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf'];

            const detector = new window.BarcodeDetector({ formats });
            nativeDetectorRef.current = detector;
            setHardwareAccelerationActive(true);

            if (videoRef.current) {
              stopNativeLoop = startNativeDetectionLoop(videoRef.current, detector);
            }
          } catch (e) {
            console.warn('Native BarcodeDetector init failed, falling back to ZXing:', e);
            setHardwareAccelerationActive(false);
          }
        }

        // 2. Continuous ZXing MultiFormat Reader Fallback
        const hints = new Map();
        const activeFormats =
          scanMode === 'QR_ONLY'
            ? [BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.AZTEC]
            : scanMode === 'BARCODE_1D'
            ? [
                BarcodeFormat.CODE_128,
                BarcodeFormat.CODE_39,
                BarcodeFormat.EAN_13,
                BarcodeFormat.EAN_8,
                BarcodeFormat.UPC_A,
                BarcodeFormat.UPC_E,
                BarcodeFormat.ITF,
              ]
            : [
                BarcodeFormat.QR_CODE,
                BarcodeFormat.DATA_MATRIX,
                BarcodeFormat.AZTEC,
                BarcodeFormat.CODE_128,
                BarcodeFormat.CODE_39,
                BarcodeFormat.EAN_13,
                BarcodeFormat.EAN_8,
                BarcodeFormat.UPC_A,
                BarcodeFormat.UPC_E,
                BarcodeFormat.ITF,
              ];

        hints.set(DecodeHintType.POSSIBLE_FORMATS, activeFormats);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 80,
          delayBetweenScanSuccess: 1200,
        });

        if (videoRef.current) {
          const controls = await reader.decodeFromVideoElement(videoRef.current, (result, error) => {
            if (result && !isLockedRef.current) {
              const rawText = result.getText();
              const formatStr = result.getBarcodeFormat().toString();
              handleCodeDetected(rawText, formatStr, 'CAMERA_SCAN');
            }
          });
          controlsRef.current = controls;
        }
      } catch (err: unknown) {
        console.error('Scanner init error:', err);
        if (isSubscribed) {
          const errMsg = err instanceof Error ? err.message : String(err);
          if (errMsg.includes('Permission') || errMsg.includes('NotAllowedError')) {
            setCameraError('Camera access was denied. Please allow camera permissions in browser settings.');
          } else {
            setCameraError('Unable to open camera feed. Switch to manual entry or simulate preset.');
          }
        }
      }
    }

    initScanner();

    return () => {
      isSubscribed = false;
      if (stopNativeLoop) stopNativeLoop();
      stopCameraStreams();
    };
  }, [scanMode, isScanning, selectedDeviceId, handleCodeDetected, startNativeDetectionLoop, stopCameraStreams]);

  // Torch toggle
  const toggleTorch = async () => {
    if (!videoRef.current || !videoRef.current.srcObject) return;
    const stream = videoRef.current.srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    if (track && torchSupported) {
      try {
        const nextState = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState } as MediaTrackConstraintSet],
        });
        setTorchOn(nextState);
      } catch (err) {
        console.warn('Could not toggle torch:', err);
      }
    }
  };

  // Switch camera device
  const cycleCamera = () => {
    if (videoDevices.length <= 1) return;
    const currentIndex = videoDevices.findIndex((d) => d.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % videoDevices.length;
    setSelectedDeviceId(videoDevices[nextIndex].deviceId);
  };

  // Restart scanning
  const restartScanning = () => {
    setCompletedScan(null);
    setParsedQr(null);
    setMatchedProduct(null);
    isLockedRef.current = false;
    setIsScanning(true);
  };

  // Manual code submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleCodeDetected(manualInput.trim(), 'MANUAL_ENTRY', 'MANUAL_ENTRY');
  };

  // Switch active line helper when a QR matches another PO line
  const handleSwitchToMatchedLine = (skuToSwitch: string) => {
    const target = po.lines.find((l) => l.sku === skuToSwitch);
    if (target) {
      setActiveLine(target);
      // Re-evaluate with new target line
      if (completedScan) {
        const recheck = evaluateScannedCode(completedScan.barcode_value, completedScan.barcode_format, completedScan.scan_source);
        setCompletedScan(recheck.scan);
        setMatchedProduct(recheck.product);
        setParsedQr(recheck.parsed);
        onScanSaved(recheck.scan);
      }
    }
  };

  // Quick Preset Simulator for High-Speed Dock Testing
  const handleSimulatePreset = (presetType: 'ACTIVE_QR' | 'COMPLEX_JSON_QR' | 'GS1_URL_QR' | 'OTHER_PO_LINE' | 'UNLISTED') => {
    let rawVal = '';
    let fmt = 'QR_CODE';

    if (presetType === 'ACTIVE_QR') {
      rawVal = activeLine.gtin || activeLine.sku;
      fmt = 'QR_CODE';
    } else if (presetType === 'COMPLEX_JSON_QR') {
      rawVal = JSON.stringify({
        sku: activeLine.sku,
        gtin: activeLine.gtin || '084012345678',
        po: po.po_number,
        batch: `LOT-2026-${activeLine.sku.slice(-4)}`,
        carton_qty: activeLine.expected_units_per_carton,
      });
      fmt = 'QR_CODE';
    } else if (presetType === 'GS1_URL_QR') {
      rawVal = `https://id.gs1.org/01/${activeLine.gtin || '00840123456789'}/21/SN9872?sku=${activeLine.sku}`;
      fmt = 'QR_CODE';
    } else if (presetType === 'OTHER_PO_LINE') {
      const other = po.lines.find((l) => l.id !== activeLine.id) || po.lines[0];
      rawVal = JSON.stringify({
        sku: other.sku,
        gtin: other.gtin || '012345678901',
        po: po.po_number,
      });
      fmt = 'QR_CODE';
    } else {
      rawVal = 'UNLISTED-SUPPLIER-BATCH-X99';
      fmt = 'QR_CODE';
    }

    handleCodeDetected(rawVal, fmt, 'CAMERA_SCAN');
  };

  // Check if completed scan matches a different PO line
  const otherMatchingLine =
    completedScan &&
    po.lines.find(
      (l) =>
        l.id !== activeLine.id &&
        (l.sku.toUpperCase() === (completedScan.matched_sku || completedScan.barcode_value).toUpperCase() ||
          (l.gtin && l.gtin === completedScan.barcode_value))
    );

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans text-xs pb-16">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition cursor-pointer"
            title="Back to Inspection Setup"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                DockProof AI &bull; Inspection #{inspectionId.slice(0, 8)}
              </span>
              <span className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded font-mono">
                /inspections/{inspectionId}/scan
              </span>
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight mt-0.5 flex items-center gap-2">
              Real-Time QR &amp; Barcode Receiving Scanner
            </h1>
          </div>
        </div>

        {completedScan && (
          <button
            type="button"
            onClick={onContinueToPhotos}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-cyan-950 self-start sm:self-center"
          >
            Continue to Photo Evidence <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Shipment & PO Line Summary Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <span className="text-slate-500 font-semibold flex items-center gap-1.5 text-[11px]">
            <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" /> Purchase Order
          </span>
          <div className="text-sm font-bold text-white font-mono mt-1">{po.po_number}</div>
          <div className="text-[11px] text-slate-400 truncate">{po.supplier_name || 'Inbound Supplier'}</div>
        </div>

        <div>
          <span className="text-slate-500 font-semibold flex items-center gap-1.5 text-[11px]">
            <Package className="w-3.5 h-3.5 text-emerald-400" /> Target SKU
          </span>
          <div className="text-sm font-bold text-cyan-300 font-mono mt-1">{activeLine.sku}</div>
          <div className="text-[11px] text-slate-400 truncate">{activeLine.product_name}</div>
        </div>

        <div>
          <span className="text-slate-500 font-semibold text-[11px]">Expected Packaging</span>
          <div className="text-sm font-bold text-white mt-1">
            {activeLine.expected_cartons} <span className="text-slate-400 text-xs font-normal">cartons</span>
          </div>
          <div className="text-[11px] text-slate-400">{activeLine.expected_units_per_carton} units / box</div>
        </div>

        <div>
          <span className="text-slate-500 font-semibold text-[11px]">Scanner Engine</span>
          <div className="text-sm font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-emerald-400" /> Real-Time Auto-Detect
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            {hardwareAccelerationActive ? 'Hardware Accelerated (60 FPS)' : 'ZXing Continuous Engine'}
          </div>
        </div>
      </div>

      {/* Mode Selector Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 p-2 rounded-xl">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setScanMode('DUAL');
              restartScanning();
            }}
            className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer ${
              scanMode === 'DUAL'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Scan className="w-3.5 h-3.5" />
            Dual Scan (QR + Barcode)
          </button>

          <button
            type="button"
            onClick={() => {
              setScanMode('QR_ONLY');
              restartScanning();
            }}
            className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer ${
              scanMode === 'QR_ONLY'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            QR Code Focus (2D High Density)
          </button>

          <button
            type="button"
            onClick={() => {
              setScanMode('BARCODE_1D');
              restartScanning();
            }}
            className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer ${
              scanMode === 'BARCODE_1D'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Barcode className="w-3.5 h-3.5" />
            1D Linear Barcode
          </button>

          <button
            type="button"
            onClick={() => {
              setScanMode('MANUAL');
              stopCameraStreams();
            }}
            className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer ${
              scanMode === 'MANUAL'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            Manual Keypad
          </button>
        </div>

        {/* Audio Mute / Unmute */}
        <button
          type="button"
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title={soundEnabled ? 'Audio Feedback Enabled' : 'Audio Feedback Muted'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
        </button>
      </div>

      {/* Main Real-Time Scanning Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Camera Viewport / Reticle (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          {scanMode !== 'MANUAL' ? (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden relative shadow-2xl aspect-[4/3] sm:aspect-[16/11] flex items-center justify-center">
              {/* Live Video Element */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  isScanning ? 'opacity-100' : 'opacity-30 blur-xs'
                }`}
              />

              {/* Reticle HUD Overlay (While Scanning) */}
              {isScanning && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                  {/* Aiming Reticle Box */}
                  <div
                    className={`relative transition-all duration-300 ${
                      scanMode === 'QR_ONLY'
                        ? 'w-56 h-56 border border-cyan-400/30 rounded-2xl'
                        : scanMode === 'BARCODE_1D'
                        ? 'w-72 h-36 border border-cyan-400/30 rounded-xl'
                        : 'w-64 h-52 border border-cyan-400/30 rounded-2xl'
                    }`}
                  >
                    {/* Corner Guides */}
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-cyan-400 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-cyan-400 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-cyan-400 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-cyan-400 rounded-br-lg" />

                    {/* Laser Sweeper Animation */}
                    <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#06b6d4] animate-pulse top-1/2 -translate-y-1/2" />

                    {/* Mode Tag inside Reticle */}
                    <div className="absolute -top-7 inset-x-0 flex justify-center">
                      <span className="bg-black/75 backdrop-blur-md text-cyan-300 text-[10px] font-mono px-2 py-0.5 rounded-full border border-cyan-500/40 uppercase tracking-wider flex items-center gap-1">
                        {scanMode === 'QR_ONLY' ? (
                          <>
                            <QrCode className="w-3 h-3 text-cyan-400" /> 2D QR Code Reticle
                          </>
                        ) : scanMode === 'BARCODE_1D' ? (
                          <>
                            <Barcode className="w-3 h-3 text-cyan-400" /> 1D Barcode Beam
                          </>
                        ) : (
                          <>
                            <Scan className="w-3 h-3 text-cyan-400" /> Real-Time Auto-Detect
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  <p className="mt-8 text-center text-[11px] text-white/90 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 font-medium">
                    Center carton QR code or barcode inside reticle
                  </p>
                </div>
              )}

              {/* Floating Camera Controls Toolbar */}
              <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
                {torchSupported && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`p-2 rounded-xl backdrop-blur-md transition cursor-pointer ${
                      torchOn
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/40'
                        : 'bg-black/60 text-white hover:bg-black/80 border border-white/10'
                    }`}
                    title={torchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
                  >
                    {torchOn ? <Flashlight className="w-4 h-4" /> : <FlashlightOff className="w-4 h-4" />}
                  </button>
                )}

                {videoDevices.length > 1 && (
                  <button
                    type="button"
                    onClick={cycleCamera}
                    className="p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white border border-white/10 backdrop-blur-md transition cursor-pointer"
                    title="Switch Camera Lens"
                  >
                    <SwitchCamera className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Frozen Capture Badge after detection */}
              {!isScanning && completedScan && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs p-4 text-center space-y-3 z-10 animate-in fade-in">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-wider text-emerald-400 font-bold block">
                      Code Decoded Successfully
                    </span>
                    <span className="font-mono text-white font-bold text-sm break-all">
                      {completedScan.barcode_value}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={restartScanning}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Scan Another Item
                  </button>
                </div>
              )}

              {/* Camera Error Message */}
              {cameraError && (
                <div className="absolute inset-0 bg-slate-950/90 p-6 flex flex-col items-center justify-center text-center space-y-3 z-30">
                  <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
                    <CameraOff className="w-5 h-5" />
                  </div>
                  <p className="text-xs text-rose-300 max-w-sm">{cameraError}</p>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setScanMode('MANUAL')}
                      className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                    >
                      Use Manual Input
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSimulatePreset('ACTIVE_QR')}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs transition"
                    >
                      Test with Sample QR
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Manual Keypad Input Panel */
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Keyboard className="w-4 h-4 text-cyan-400" />
                Manual SKU / Barcode Entry
              </div>
              <p className="text-slate-400 text-xs">
                Enter the SKU, UPC/EAN barcode, or raw QR payload from the packaging label:
              </p>

              <form onSubmit={handleManualSubmit} className="space-y-4">
                <input
                  type="text"
                  required
                  placeholder="e.g. SKU-1002, 084012345678, or JSON payload..."
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white font-mono text-sm focus:border-cyan-500 focus:outline-none"
                />

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Check className="w-4 h-4" /> Resolve &amp; Fetch Details
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScanMode('DUAL');
                      restartScanning();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    Open Camera
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Quick Testing & Preset Simulation Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
            <span className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Quick QR Simulation &amp; Complex Packaging Presets
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleSimulatePreset('ACTIVE_QR')}
                className="bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-cyan-500/40 px-2.5 py-1 rounded text-[11px] font-mono transition"
              >
                Simulate: Active Line QR ({activeLine.sku})
              </button>
              <button
                type="button"
                onClick={() => handleSimulatePreset('COMPLEX_JSON_QR')}
                className="bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-cyan-500/40 px-2.5 py-1 rounded text-[11px] font-mono transition"
              >
                Simulate: Complex JSON Packaging QR
              </button>
              <button
                type="button"
                onClick={() => handleSimulatePreset('GS1_URL_QR')}
                className="bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-cyan-500/40 px-2.5 py-1 rounded text-[11px] font-mono transition"
              >
                Simulate: GS1 Digital Link URL
              </button>
              {po.lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleSimulatePreset('OTHER_PO_LINE')}
                  className="bg-slate-950 hover:bg-slate-800 text-amber-300 border border-slate-800 hover:border-amber-500/40 px-2.5 py-1 rounded text-[11px] font-mono transition"
                >
                  Simulate: Cross-PO Line QR
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Decoded Payload & Product Details (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {completedScan ? (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Product Match Card Component */}
              <ProductMatchCard
                expectedLine={activeLine}
                poNumber={po.po_number}
                matchedProduct={matchedProduct}
                scannedBarcode={completedScan.barcode_value}
                barcodeFormat={completedScan.barcode_format}
                matchStatus={completedScan.match_status}
                onRequestManagerReview={onRequestManagerReview}
                onLogException={onLogException}
              />

              {/* Cross-PO Line Match Quick Switch Action */}
              {otherMatchingLine && (
                <div className="bg-amber-950/40 border border-amber-500/50 p-3.5 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Cross-PO Line Detected</span>
                  </div>
                  <p className="text-[11px] text-amber-200/90 leading-relaxed">
                    Scanned code belongs to PO Line <strong>{otherMatchingLine.sku}</strong> ({otherMatchingLine.product_name}).
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSwitchToMatchedLine(otherMatchingLine.sku)}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <ArrowRight className="w-3.5 h-3.5" /> Switch Target Line to {otherMatchingLine.sku}
                  </button>
                </div>
              )}

              {/* Complex Packaging 2D QR Payload Inspector */}
              {parsedQr && parsedQr.isStructured && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1 font-mono">
                      <QrCode className="w-3 h-3" /> 2D QR Packaging Payload ({parsedQr.formatType})
                    </span>
                    <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono">
                      Parsed
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                    {parsedQr.extractedSku && (
                      <div className="bg-slate-950 p-2 rounded border border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block">Extracted SKU</span>
                        <span className="font-bold text-cyan-300">{parsedQr.extractedSku}</span>
                      </div>
                    )}
                    {parsedQr.extractedGtin && (
                      <div className="bg-slate-950 p-2 rounded border border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block">Extracted GTIN</span>
                        <span className="font-bold text-slate-200">{parsedQr.extractedGtin}</span>
                      </div>
                    )}
                    {parsedQr.extractedBatch && (
                      <div className="bg-slate-950 p-2 rounded border border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block">Batch / Lot #</span>
                        <span className="text-slate-200">{parsedQr.extractedBatch}</span>
                      </div>
                    )}
                    {parsedQr.extractedQuantity && (
                      <div className="bg-slate-950 p-2 rounded border border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block">Carton Units</span>
                        <span className="text-emerald-400 font-bold">{parsedQr.extractedQuantity}</span>
                      </div>
                    )}
                  </div>

                  {/* Metadata key-value table */}
                  {Object.keys(parsedQr.metadata).length > 0 && (
                    <div className="bg-slate-950 p-2 rounded border border-slate-800/80 space-y-1 font-mono text-[10px]">
                      <span className="text-slate-500 block uppercase">Raw Structured Fields:</span>
                      {Object.entries(parsedQr.metadata).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-slate-300">
                          <span className="text-slate-500">{k}:</span>
                          <span className="truncate max-w-[200px] text-right font-medium">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={onContinueToPhotos}
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-cyan-950"
                >
                  Accept &amp; Continue to Photo Evidence <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={restartScanning}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-slate-300 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer border border-slate-800"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Re-scan / Clear
                </button>
              </div>
            </div>
          ) : (
            /* Standby Card when no code is scanned yet */
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-white font-bold text-xs uppercase tracking-wider">
                <Layers className="w-4 h-4 text-cyan-400" />
                Real-Time Scanner Standby
              </div>

              <p className="text-slate-400 text-xs leading-relaxed">
                Aim the camera at the product or outer carton barcode or 2D QR code. DockProof AI automatically detects 1D and 2D formats in real time and cross-references against PO lines.
              </p>

              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800/80 space-y-2 font-mono text-[11px]">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                  Target Verification Parameters
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Expected SKU:</span>
                  <span className="text-cyan-300 font-bold">{activeLine.sku}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Expected GTIN:</span>
                  <span className="text-slate-200">{activeLine.gtin || 'Any Registered'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Expected Packaging:</span>
                  <span className="text-slate-200">{activeLine.expected_cartons} cartons</span>
                </div>
              </div>

              <div className="space-y-1.5 text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Supports JSON-encoded QR payloads</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Supports GS1 Digital Link &amp; Data Matrix</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Supports UPC-A, EAN-13, Code 128, ITF</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
