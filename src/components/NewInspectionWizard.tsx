import React, { useState } from 'react';
import {
  Camera,
  Barcode,
  Package,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  X,
  FileCheck,
  ShieldCheck,
  ChevronRight,
  Edit3,
  PackagePlus,
  Info,
  Layers,
  Lock,
  Check,
  Trash2,
} from 'lucide-react';
import {
  PurchaseOrder,
  PurchaseOrderLine,
  Product,
  Inspection,
  BarcodeScan,
  InspectionPhoto,
} from '../types';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { GuidedPhotoCapture } from './GuidedPhotoCapture';
import { ManualSkuModal } from './ManualSkuModal';
import { ManualSkuVerificationStep, VerificationResult } from './ManualSkuVerificationStep';

interface NewInspectionWizardProps {
  purchaseOrders: PurchaseOrder[];
  products: Product[];
  onInspectionFinished: (inspection: Inspection) => void;
  onCancel: () => void;
}

export function NewInspectionWizard({
  purchaseOrders,
  products,
  onInspectionFinished,
  onCancel,
}: NewInspectionWizardProps) {
  // Wizard active section focus
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);

  const [selectedPoId, setSelectedPoId] = useState<string>(purchaseOrders[0]?.id || '');
  const [selectedLineSku, setSelectedLineSku] = useState<string>('');
  const [manualLineOverride, setManualLineOverride] = useState<PurchaseOrderLine | null>(null);

  // Modal states
  const [showManualSkuModal, setShowManualSkuModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);

  // Inspection flow data
  const [scannedBarcode, setScannedBarcode] = useState<BarcodeScan | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<InspectionPhoto[]>([]);
  const [cartonCountObserved, setCartonCountObserved] = useState<number>(1);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const selectedPO = purchaseOrders.find((po) => po.id === selectedPoId);

  // Active line: manual override takes priority if set, else selected PO line
  const activeLine: PurchaseOrderLine | undefined =
    manualLineOverride ||
    selectedPO?.lines.find((l) => (selectedLineSku ? l.sku === selectedLineSku : true)) ||
    selectedPO?.lines[0];

  const matchedProduct = products.find((p) => p.sku === (activeLine?.sku || ''));

  // Ensure effective product specification exists even for custom manual SKUs
  const effectiveProduct: Product = matchedProduct || {
    id: `prod-${activeLine?.sku || 'manual'}`,
    sku: activeLine?.sku || 'UNKNOWN',
    product_name: activeLine?.product_name || activeLine?.sku || 'Inbound Item',
    gtin: activeLine?.gtin || '',
    expected_units_per_carton: activeLine?.expected_units_per_carton || 1,
    product_family: activeLine?.product_family || 'Standard Inventory',
    active: true,
    created_at: new Date().toISOString(),
  };

  // Initialize line when PO is changed
  const handleSelectPO = (poId: string) => {
    setSelectedPoId(poId);
    setManualLineOverride(null);
    setScannedBarcode(null);
    setVerificationResult(null);
    const po = purchaseOrders.find((p) => p.id === poId);
    if (po && po.lines[0]) {
      setSelectedLineSku(po.lines[0].sku);
      setCartonCountObserved(po.lines[0].expected_cartons);
    }
  };

  const handleSelectLine = (sku: string) => {
    setSelectedLineSku(sku);
    setManualLineOverride(null);
    setVerificationResult(null); // Reset verification on line change
    const l = selectedPO?.lines.find((line) => line.sku === sku);
    if (l) {
      setCartonCountObserved(l.expected_cartons);
    }
  };

  const handleSaveManualSku = (skuData: Omit<PurchaseOrderLine, 'id' | 'purchase_order_id'>) => {
    if (!selectedPO) return;
    const newLine: PurchaseOrderLine = {
      id: `manual-line-${Date.now()}`,
      purchase_order_id: selectedPO.id,
      ...skuData,
      created_at: new Date().toISOString(),
    };
    setManualLineOverride(newLine);
    setSelectedLineSku(newLine.sku);
    setCartonCountObserved(newLine.expected_cartons);
    setVerificationResult(null);
    setShowManualSkuModal(false);
  };

  const handleBarcodeComplete = (scan: BarcodeScan) => {
    setScannedBarcode(scan);
    setVerificationResult(null); // Fresh scan requires verification
    setShowScannerModal(false);
    setActiveStep(3); // Automatically advance to Manual SKU Verification step
  };

  const handleVerificationConfirm = (result: VerificationResult) => {
    setVerificationResult(result);
    if (result.verified) {
      setActiveStep(4); // Advance to Physical Inspection
    }
  };

  const handlePhotosComplete = (photos: InspectionPhoto[]) => {
    setCapturedPhotos(photos);
    setShowPhotoCapture(false);
  };

  const runAnalysis = async () => {
    if (!selectedPO || !activeLine || capturedPhotos.length === 0 || !verificationResult?.verified) {
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);

    const inspectionId = crypto.randomUUID();
    const barcodeList = scannedBarcode ? [scannedBarcode] : [];

    try {
      const response = await fetch('/api/inspections/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspectionId,
          poLine: {
            ...activeLine,
            po_number: selectedPO.po_number,
          },
          product: effectiveProduct,
          barcodeScans: barcodeList,
          photos: capturedPhotos,
          manualCartonCount: Number(cartonCountObserved),
          operatingMode: 'PILOT',
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'AI verification failed');
      }

      const result = await response.json();
      const rulesOut = result.rulesOutput;

      const createdInspection: Inspection = {
        id: inspectionId,
        inspection_number: `INSP-${Date.now().toString().slice(-6)}`,
        purchase_order_id: selectedPO.id,
        purchase_order_line_id: activeLine.id,
        po_number: selectedPO.po_number,
        supplier_id: selectedPO.supplier_id,
        supplier_name: selectedPO.supplier_name,
        product_sku: activeLine.sku,
        product_name: activeLine.product_name,
        operator_id: 'current-operator',
        operator_name: 'Warehouse Operator',
        status: rulesOut.finalDecision,
        mode: 'PILOT',
        overall_confidence: rulesOut.checks[0]?.confidence || 0.9,
        action_recommendation: result.actionRecommendation,
        barcode_scans: barcodeList,
        photos: capturedPhotos,
        manual_sku_verified: true,
        manual_sku_verified_by: verificationResult.verifiedBy,
        manual_sku_verified_at: verificationResult.verifiedAt,
        manual_sku_notes: verificationResult.notes,
        checks: rulesOut.checks.map((c: any) => ({
          id: crypto.randomUUID(),
          check_name: c.check_name,
          expected_value: c.expected_value,
          observed_value: c.observed_value,
          verdict: c.status,
          confidence: c.confidence,
          reason: c.reason,
          evidence: c.evidence_references,
        })),
        exceptions: (rulesOut.exceptionsToCreate || []).map((e: any) => ({
          id: crypto.randomUUID(),
          inspection_id: inspectionId,
          purchase_order_id: selectedPO.id,
          po_number: selectedPO.po_number,
          product_sku: activeLine.sku,
          severity: e.severity,
          issue_type: e.exception_type,
          status: 'OPEN',
          notes: e.root_cause,
          created_at: new Date().toISOString(),
        })),
        observed_carton_count: rulesOut.observedCounts?.cartonCount ?? cartonCountObserved,
        observed_units_per_carton:
          rulesOut.observedCounts?.unitsPerCarton ?? activeLine.expected_units_per_carton,
        observed_total_quantity: rulesOut.observedCounts?.totalQuantity,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };

      onInspectionFinished(createdInspection);
    } catch (err: unknown) {
      console.error('Inspection analysis error:', err);
      setAnalysisError(
        err instanceof Error ? err.message : 'Analysis failed. Check camera and network.'
      );
      setIsAnalyzing(false);
    }
  };

  const isSkuVerified = Boolean(verificationResult?.verified);

  return (
    <div className="max-w-xl mx-auto space-y-5 pb-16">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <span className="text-xs text-cyan-400 font-semibold tracking-wider uppercase">
            Receiving Dock Workflow
          </span>
          <h2 className="text-base font-bold text-white">Inbound Shipment Inspection</h2>
        </div>
        <button
          onClick={onCancel}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Step Indicator (5-Stage Compliant Workflow) */}
      <div className="grid grid-cols-4 gap-1.5 text-[11px] font-semibold text-center">
        <div
          onClick={() => setActiveStep(1)}
          className={`p-2 rounded cursor-pointer transition ${
            activeStep === 1
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
          }`}
        >
          1. PO &amp; SKU
        </div>
        <div
          onClick={() => setActiveStep(2)}
          className={`p-2 rounded cursor-pointer transition ${
            scannedBarcode
              ? 'bg-emerald-500/20 text-emerald-300'
              : activeStep === 2
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-900 text-slate-400'
          }`}
        >
          2. Barcode
        </div>
        <div
          onClick={() => scannedBarcode && setActiveStep(3)}
          className={`p-2 rounded transition ${
            isSkuVerified
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : scannedBarcode
              ? activeStep === 3
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse cursor-pointer'
                : 'bg-slate-900 text-amber-400 cursor-pointer'
              : 'bg-slate-900 text-slate-600 cursor-not-allowed'
          }`}
        >
          3. SKU Verify {isSkuVerified ? '✓' : ''}
        </div>
        <div
          onClick={() => isSkuVerified && setActiveStep(4)}
          className={`p-2 rounded transition ${
            capturedPhotos.length >= 6
              ? 'bg-emerald-500/20 text-emerald-300'
              : isSkuVerified
              ? activeStep === 4
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'bg-slate-900 text-slate-400 cursor-pointer'
              : 'bg-slate-900 text-slate-600 cursor-not-allowed'
          }`}
        >
          4. Physical Insp.
        </div>
      </div>

      {/* Step 1: Select PO and Detailed SKU (With Manual Add / Edit SKU Support) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Package className="w-4 h-4 text-cyan-400" />
            1. Inbound Purchase Order &amp; SKU Details
          </h3>
          <button
            type="button"
            onClick={() => setShowManualSkuModal(true)}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 bg-cyan-950/60 border border-cyan-800/80 px-2.5 py-1 rounded-lg transition cursor-pointer"
          >
            <PackagePlus className="w-3.5 h-3.5" />
            + Manually Add / Custom SKU
          </button>
        </div>

        {/* PO Selector */}
        <div>
          <label className="text-slate-300 font-semibold block mb-1">Inbound Purchase Order</label>
          <select
            value={selectedPoId}
            onChange={(e) => handleSelectPO(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono"
          >
            {purchaseOrders.map((po) => (
              <option key={po.id} value={po.id}>
                {po.po_number} &bull; {po.supplier_name || 'Vendor'} ({po.lines.length} lines)
              </option>
            ))}
          </select>
        </div>

        {/* Line Selector or Manual Override Notice */}
        {manualLineOverride ? (
          <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-500/40 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-cyan-300 font-bold flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5" /> Manual SKU Specification Active
              </span>
              <button
                type="button"
                onClick={() => setManualLineOverride(null)}
                className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
              >
                Reset to PO Lines
              </button>
            </div>
            <p className="text-[11px] text-cyan-200/90">
              This inspection is utilizing operator-defined manual SKU parameters for unlisted or custom inbound inventory.
            </p>
          </div>
        ) : (
          selectedPO &&
          selectedPO.lines.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-300 font-semibold">Target Product Line</label>
                <button
                  type="button"
                  onClick={() => setShowManualSkuModal(true)}
                  className="text-[11px] text-slate-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" /> Edit SKU Details
                </button>
              </div>
              <select
                value={activeLine?.sku}
                onChange={(e) => handleSelectLine(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono"
              >
                {selectedPO.lines.map((line) => (
                  <option key={line.id} value={line.sku}>
                    {line.sku} &bull; {line.product_name} (Expected: {line.expected_cartons} ctn / {line.expected_units} units)
                  </option>
                ))}
              </select>
            </div>
          )
        )}

        {/* Detailed SKU Specifications Card */}
        {activeLine && (
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-cyan-300 font-mono font-bold text-sm">{activeLine.sku}</span>
                {activeLine.is_manual ? (
                  <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30">
                    Manual Custom SKU
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                    PO Line Item
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowManualSkuModal(true)}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" /> Adjust Details
              </button>
            </div>

            <div className="space-y-1">
              <div className="text-white font-semibold text-xs">{activeLine.product_name}</div>
              <div className="text-slate-400 text-[11px]">
                GTIN / Barcode: <span className="font-mono text-slate-200">{activeLine.gtin || 'Not Catalogued'}</span>
              </div>
              {activeLine.product_family && (
                <div className="text-slate-400 text-[11px]">
                  Category / Family: <span className="text-slate-200">{activeLine.product_family}</span>
                </div>
              )}
            </div>

            {/* Packaging Metrics */}
            <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
              <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Expected Cartons</span>
                <span className="text-white font-bold">{activeLine.expected_cartons}</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Units / Carton</span>
                <span className="text-white font-bold">{activeLine.expected_units_per_carton}</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Total Expected</span>
                <span className="text-emerald-400 font-bold">{activeLine.expected_units}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Barcode Scan */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Barcode className="w-4 h-4 text-cyan-400" />
            2. Carton Barcode Verification
          </h3>
          {scannedBarcode && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                scannedBarcode.match_status === 'PASS'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              SCANNED
            </span>
          )}
        </div>

        {scannedBarcode ? (
          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-500 font-mono">
                {scannedBarcode.barcode_format} ({scannedBarcode.scan_source})
              </div>
              <div className="font-mono text-cyan-300 font-bold text-sm">{scannedBarcode.barcode_value}</div>
            </div>
            <button
              type="button"
              onClick={() => setShowScannerModal(true)}
              className="text-xs text-slate-300 hover:text-white px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 flex items-center gap-1 transition"
            >
              <RefreshCw className="w-3 h-3" /> Re-scan
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowScannerModal(true)}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-cyan-950"
          >
            <Camera className="w-4 h-4" /> Open Camera Barcode Scanner
          </button>
        )}
      </div>

      {/* Step 3: MANUAL SKU VERIFICATION STEP (Cross-references scanned SKU against active PO lines) */}
      {selectedPO && activeLine && (
        <ManualSkuVerificationStep
          purchaseOrder={selectedPO}
          activeLine={activeLine}
          scannedBarcode={scannedBarcode}
          products={products}
          verificationResult={verificationResult}
          onConfirmVerification={handleVerificationConfirm}
          onSwitchActiveLine={(sku) => handleSelectLine(sku)}
          onOpenManualSkuModal={() => setShowManualSkuModal(true)}
          onRequestRescan={() => setShowScannerModal(true)}
          onProceedToPhysicalInspection={() => setActiveStep(4)}
        />
      )}

      {/* Step 4: Physical Inspection (Photos & Carton Count) - GATED UNTIL SKU VERIFIED */}
      <div className="space-y-4">
        {!isSkuVerified && (
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 flex items-center gap-2 text-xs">
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Physical Inspection Gated:</strong> Complete and sign off{' '}
              <span className="text-cyan-300 font-semibold">Manual SKU Verification</span> in Step 3 before capturing evidence photos and counting cartons.
            </span>
          </div>
        )}

        <div className={`space-y-4 transition ${isSkuVerified ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          {/* Photo Capture Set */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Camera className="w-4 h-4 text-cyan-400" />
                4. Photographic Evidence Set ({capturedPhotos.length}/6 Required)
              </h3>
              {capturedPhotos.length >= 6 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  COMPLETE
                </span>
              )}
            </div>

            {capturedPhotos.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {capturedPhotos.map((p) => (
                    <div key={p.id} className="relative aspect-square rounded-lg border border-slate-800 bg-black overflow-hidden group">
                      <img src={p.base64} alt={p.photo_type} className="w-full h-full object-cover" />
                      {/* Type label */}
                      <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[8px] text-center py-0.5 px-1 truncate text-slate-300">
                        {p.photo_type.replace(/_/g, ' ')}
                      </span>
                      {/* Quality badge */}
                      <span className={`absolute top-1 left-1 text-[8px] font-bold px-1.5 py-0.5 rounded ${p.quality_status === 'GOOD' ? 'bg-emerald-500 text-black' : 'bg-amber-500 text-black'}`}>
                        {p.quality_status === 'GOOD' ? '✓' : '⚠'}
                      </span>
                      {/* Delete button — visible on hover */}
                      <button
                        type="button"
                        onClick={() => setCapturedPhotos((prev) => prev.filter((x) => x.id !== p.id))}
                        className="absolute top-1 right-1 w-6 h-6 bg-rose-600/90 hover:bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer shadow-lg"
                        title="Delete this photo"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPhotoCapture(true)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 rounded-lg text-xs font-medium transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Camera className="w-3.5 h-3.5 text-cyan-400" /> Add / Manage Photos
                  </button>
                  <button
                    type="button"
                    onClick={() => setCapturedPhotos([])}
                    className="bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/50 text-rose-300 py-2 px-3 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                    title="Delete all photos"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear All
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={!isSkuVerified}
                onClick={() => setShowPhotoCapture(true)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <Camera className="w-4 h-4 text-cyan-400" /> Open Camera — Capture Evidence Photos
              </button>
            )}
          </div>

          {/* Observed Carton Count */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 text-xs">
            <label className="text-slate-300 font-semibold block">
              Carton Count Observed on Receiving Dock:
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                value={cartonCountObserved}
                onChange={(e) => setCartonCountObserved(Number(e.target.value))}
                className="w-24 bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-center text-sm font-bold"
              />
              <span className="text-slate-400 text-xs">
                carton(s) counted. Expected: <strong className="text-white">{activeLine?.expected_cartons}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Error Notification */}
      {analysisError && (
        <div className="bg-rose-950/40 border border-rose-800 p-3 rounded-xl text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{analysisError}</span>
        </div>
      )}

      {/* Trigger AI Verification Button */}
      <div className="pt-2">
        <button
          type="button"
          disabled={!scannedBarcode || !isSkuVerified || capturedPhotos.length < 6 || isAnalyzing}
          onClick={runAnalysis}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition cursor-pointer shadow-xl shadow-emerald-950"
        >
          {isAnalyzing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Running Multimodal AI Inspection...
            </>
          ) : (
            <>
              <ShieldCheck className="w-5 h-5" />
              Verify Shipment with Gemini &amp; Rules Engine
            </>
          )}
        </button>
        {(!scannedBarcode || !isSkuVerified || capturedPhotos.length < 6) && (
          <p className="text-[11px] text-slate-500 text-center mt-2">
            {!scannedBarcode
              ? 'Barcode scan required.'
              : !isSkuVerified
              ? 'Manual SKU verification sign-off required in Step 3 before AI audit.'
              : '6 mandatory photos required before verification.'}
          </p>
        )}
      </div>

      {/* Modal: Manual SKU Entry / Edit */}
      {showManualSkuModal && (
        <ManualSkuModal
          initialValues={activeLine}
          catalogProducts={products}
          onSave={handleSaveManualSku}
          onClose={() => setShowManualSkuModal(false)}
        />
      )}

      {/* Modal: Real-Time Barcode Scanner */}
      {showScannerModal && activeLine && (
        <BarcodeScannerModal
          expectedSku={activeLine.sku}
          expectedGtin={activeLine.gtin}
          poNumber={selectedPO?.po_number}
          products={products}
          onScanComplete={handleBarcodeComplete}
          onClose={() => setShowScannerModal(false)}
          onRequestManagerReview={() => {
            alert('Manager review requested for uncatalogued barcode.');
          }}
          onLogException={(reason) => {
            alert(`Exception logged: ${reason}`);
          }}
        />
      )}

      {/* Modal: Guided Photo Capture */}
      {showPhotoCapture && (
        <GuidedPhotoCapture
          onComplete={handlePhotosComplete}
          onCancel={() => setShowPhotoCapture(false)}
        />
      )}
    </div>
  );
}
