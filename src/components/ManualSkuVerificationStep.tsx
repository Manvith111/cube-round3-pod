import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileCheck2,
  Package,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Edit3,
  ExternalLink,
  Barcode,
  Layers,
  Check,
  UserCheck,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { PurchaseOrder, PurchaseOrderLine, Product, BarcodeScan } from '../types';

export interface VerificationResult {
  verified: boolean;
  verifiedBy: string;
  verifiedAt: string;
  notes?: string;
  status: 'PASS' | 'SUBSTITUTION' | 'MANUAL_OVERRIDE' | 'PENDING';
}

interface ManualSkuVerificationStepProps {
  purchaseOrder: PurchaseOrder;
  activeLine: PurchaseOrderLine;
  scannedBarcode: BarcodeScan | null;
  products: Product[];
  verificationResult: VerificationResult | null;
  onConfirmVerification: (result: VerificationResult) => void;
  onSwitchActiveLine: (sku: string) => void;
  onOpenManualSkuModal: () => void;
  onRequestRescan: () => void;
  onProceedToPhysicalInspection: () => void;
}

export function ManualSkuVerificationStep({
  purchaseOrder,
  activeLine,
  scannedBarcode,
  products,
  verificationResult,
  onConfirmVerification,
  onSwitchActiveLine,
  onOpenManualSkuModal,
  onRequestRescan,
  onProceedToPhysicalInspection,
}: ManualSkuVerificationStepProps) {
  const [operatorNotes, setOperatorNotes] = useState(verificationResult?.notes || '');
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverrideForm, setShowOverrideForm] = useState(false);

  // Normalize scanned value
  const scannedValue = (scannedBarcode?.barcode_value || '').trim();
  const scannedUpper = scannedValue.toUpperCase();

  // 1. Cross-reference against Active PO Line
  const isActiveSkuMatch = Boolean(
    activeLine &&
      scannedUpper &&
      (activeLine.sku.trim().toUpperCase() === scannedUpper ||
        (activeLine.gtin && activeLine.gtin.trim() === scannedValue))
  );

  // 2. Cross-reference against ALL lines on the active PO
  const otherMatchingLine = purchaseOrder.lines.find(
    (line) =>
      line.id !== activeLine.id &&
      (line.sku.trim().toUpperCase() === scannedUpper ||
        (line.gtin && line.gtin.trim() === scannedValue))
  );

  // 3. Cross-reference against Master Product Catalog
  const catalogProduct = products.find(
    (p) =>
      p.sku.trim().toUpperCase() === scannedUpper ||
      p.gtin?.trim() === scannedValue ||
      p.barcodes?.includes(scannedValue)
  );

  // Determine Cross-Reference Status
  type MatchCategory = 'EXACT_MATCH' | 'OTHER_PO_LINE' | 'CATALOG_NOT_ON_PO' | 'UNLISTED';
  let matchCategory: MatchCategory = 'UNLISTED';

  if (isActiveSkuMatch) {
    matchCategory = 'EXACT_MATCH';
  } else if (otherMatchingLine) {
    matchCategory = 'OTHER_PO_LINE';
  } else if (catalogProduct) {
    matchCategory = 'CATALOG_NOT_ON_PO';
  } else {
    matchCategory = 'UNLISTED';
  }

  const isVerified = Boolean(verificationResult?.verified);

  const handleVerify = (status: 'PASS' | 'SUBSTITUTION' | 'MANUAL_OVERRIDE') => {
    onConfirmVerification({
      verified: true,
      verifiedBy: 'Receiving Dock Operator',
      verifiedAt: new Date().toISOString(),
      notes: operatorNotes.trim() || undefined,
      status,
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5 text-xs">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-800 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <FileCheck2 className="w-4 h-4 text-cyan-400" />
              Manual SKU Verification &amp; PO Cross-Reference
            </span>
            {isVerified ? (
              <span className="bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded text-[10px] flex items-center gap-1 border border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" /> VERIFIED
              </span>
            ) : (
              <span className="bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded text-[10px] flex items-center gap-1 border border-amber-500/30 animate-pulse">
                <AlertTriangle className="w-3 h-3" /> PENDING VERIFICATION
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            Cross-references the scanned carton SKU against all lines on Purchase Order{' '}
            <strong className="text-cyan-300 font-mono">{purchaseOrder.po_number}</strong> before proceeding to physical inspection.
          </p>
        </div>

        <button
          type="button"
          onClick={onRequestRescan}
          className="text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-medium transition flex items-center gap-1.5 shrink-0"
        >
          <RefreshCw className="w-3 h-3" /> Re-scan
        </button>
      </div>

      {/* Scanned Barcode vs Expected Cross-Reference Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Scanned Artifact */}
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 font-mono">
          <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <Barcode className="w-3 h-3 text-cyan-400" /> Scanned Dock Barcode
            </span>
            <span className="text-cyan-400 font-bold">{scannedBarcode?.barcode_format || 'FORMAT_DETECTED'}</span>
          </div>

          <div className="text-base font-bold text-white tracking-wider break-all bg-slate-900/80 p-2 rounded border border-slate-800">
            {scannedValue || 'NO_BARCODE_SCANNED'}
          </div>

          <div className="flex justify-between text-[11px] text-slate-400 pt-1">
            <span>Scan Source:</span>
            <span className="text-slate-200">{scannedBarcode?.scan_source || 'CAMERA_SCAN'}</span>
          </div>
        </div>

        {/* Expected Active PO Line */}
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider font-mono">
            <span className="flex items-center gap-1">
              <Package className="w-3 h-3 text-cyan-400" /> Active PO Line Reference
            </span>
            <span className="text-slate-300">PO: {purchaseOrder.po_number}</span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-cyan-300">{activeLine.sku}</span>
              {activeLine.is_manual && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  Manual SKU
                </span>
              )}
            </div>
            <div className="text-slate-300 font-medium truncate text-[11px]">{activeLine.product_name}</div>
          </div>

          <div className="flex justify-between text-[11px] text-slate-400 pt-1 font-mono">
            <span>Expected Packaging:</span>
            <span className="text-slate-200">
              {activeLine.expected_cartons} cartons &bull; {activeLine.expected_units_per_carton} units/ctn ({activeLine.expected_units} total)
            </span>
          </div>
        </div>
      </div>

      {/* Cross-Reference Analysis Banner */}
      {matchCategory === 'EXACT_MATCH' && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 space-y-2">
          <div className="flex items-center gap-2.5 font-bold text-sm text-emerald-300">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>Exact SKU Cross-Reference Match: PASS</span>
          </div>
          <p className="text-[11px] leading-relaxed opacity-90 text-emerald-100/90">
            The scanned carton barcode <strong className="font-mono">{scannedValue}</strong> matches the active PO line SKU{' '}
            <strong className="font-mono">{activeLine.sku}</strong> ({activeLine.product_name}). Verification requirements for inbound shipment are satisfied.
          </p>
        </div>
      )}

      {matchCategory === 'OTHER_PO_LINE' && otherMatchingLine && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/50 text-amber-200 space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm text-amber-300">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <span>Cross-Line Match Detected on Purchase Order</span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-100/90">
            Scanned barcode <strong className="font-mono">{scannedValue}</strong> matches{' '}
            <strong className="font-mono text-cyan-300">{otherMatchingLine.sku}</strong> ({otherMatchingLine.product_name}), which is{' '}
            <strong>another line on this Purchase Order</strong>, rather than currently selected line{' '}
            <strong className="font-mono">{activeLine.sku}</strong>.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onSwitchActiveLine(otherMatchingLine.sku)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-3.5 py-2 rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md"
            >
              <ArrowRight className="w-3.5 h-3.5" /> Switch Active Line to {otherMatchingLine.sku} &amp; Verify
            </button>
            <button
              type="button"
              onClick={() => handleVerify('SUBSTITUTION')}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs transition"
            >
              Verify as Authorized Cross-Line Delivery
            </button>
          </div>
        </div>
      )}

      {matchCategory === 'CATALOG_NOT_ON_PO' && catalogProduct && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-200 space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm text-rose-300">
            <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>Product Catalog Match — But NOT on Active Purchase Order</span>
          </div>
          <p className="text-[11px] leading-relaxed text-rose-100/90">
            Scanned barcode belongs to catalogue product <strong className="font-mono">{catalogProduct.sku}</strong> ({catalogProduct.product_name}), but this product is <strong>not an expected line item</strong> on Purchase Order {purchaseOrder.po_number}.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onOpenManualSkuModal}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" /> Add / Adjust Manual SKU for this Shipment
            </button>
            <button
              type="button"
              onClick={() => setShowOverrideForm(!showOverrideForm)}
              className="bg-rose-900/60 hover:bg-rose-800/80 text-rose-200 border border-rose-700 px-3 py-1.5 rounded-lg text-xs transition"
            >
              Operator Override with Exception
            </button>
          </div>
        </div>
      )}

      {matchCategory === 'UNLISTED' && (
        <div className="p-4 rounded-xl bg-slate-950 border border-amber-800/60 text-slate-300 space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm text-amber-300">
            <HelpCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <span>Barcode Unlisted on PO Lines &amp; Warehouse Catalog</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-300">
            Scanned value <strong className="font-mono text-cyan-300">{scannedValue || 'None'}</strong> was not found on any of the{' '}
            <strong>{purchaseOrder.lines.length} lines</strong> on Purchase Order {purchaseOrder.po_number}.
          </p>

          <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-2">
            <span className="text-[11px] font-bold text-white block">Dock Receiver Resolution Options:</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onOpenManualSkuModal}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" /> Enter Manual SKU Details
              </button>
              <button
                type="button"
                onClick={() => setShowOverrideForm(!showOverrideForm)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs transition"
              >
                Manually Associate with PO Line
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Association / Override Drawer if triggered */}
      {showOverrideForm && (
        <div className="p-4 rounded-xl bg-slate-950 border border-cyan-800/60 space-y-3">
          <span className="font-bold text-white text-xs block">
            Manual Receiving Dock Override &amp; Line Association
          </span>
          <p className="text-[11px] text-slate-400">
            Associate this scanned barcode with an active PO line or document authorized dock substitution:
          </p>

          <div className="space-y-2">
            <label className="text-[11px] text-slate-300 block">Select Target PO Line to Associate:</label>
            <select
              value={activeLine.sku}
              onChange={(e) => onSwitchActiveLine(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono text-xs"
            >
              {purchaseOrder.lines.map((l) => (
                <option key={l.id} value={l.sku}>
                  {l.sku} &bull; {l.product_name} ({l.expected_cartons} cartons)
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-slate-300 block">Override Rationale / Authorization:</label>
            <input
              type="text"
              placeholder="e.g. Supplier repackaged in non-standard outer sleeve with vendor code"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowOverrideForm(false)}
              className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (overrideReason.trim()) {
                  setOperatorNotes((prev) => (prev ? `${prev} | Override: ${overrideReason}` : `Override: ${overrideReason}`));
                }
                handleVerify('MANUAL_OVERRIDE');
                setShowOverrideForm(false);
              }}
              className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
            >
              Confirm Override &amp; Verify
            </button>
          </div>
        </div>
      )}

      {/* Cross-Reference Criteria Checklist */}
      <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
        <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider block">
          Inbound SKU Verification Checklist
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
          <div className="flex items-center gap-2 p-2 rounded bg-slate-900 border border-slate-800/80">
            <Check className={`w-3.5 h-3.5 ${isActiveSkuMatch ? 'text-emerald-400' : 'text-slate-500'}`} />
            <span className={isActiveSkuMatch ? 'text-slate-200' : 'text-slate-400'}>
              SKU Format Cross-Referenced
            </span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded bg-slate-900 border border-slate-800/80">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-200">PO #{purchaseOrder.po_number} Active</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded bg-slate-900 border border-slate-800/80">
            <Check className={`w-3.5 h-3.5 ${isVerified ? 'text-emerald-400' : 'text-slate-500'}`} />
            <span className={isVerified ? 'text-slate-200' : 'text-slate-400'}>
              Operator Sign-Off Complete
            </span>
          </div>
        </div>
      </div>

      {/* Dock Operator Sign-Off & Verification Action */}
      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-slate-300 font-semibold flex items-center gap-1.5 text-xs">
            <UserCheck className="w-4 h-4 text-cyan-400" />
            Dock Operator Verification Sign-Off
          </label>
          <span className="text-[10px] text-slate-500 font-mono">Receiver: Current Operator</span>
        </div>

        <div>
          <input
            type="text"
            placeholder="Optional receiving verification dock notes (e.g. Master carton barcode checked; packaging intact)..."
            value={operatorNotes}
            onChange={(e) => setOperatorNotes(e.target.value)}
            disabled={isVerified}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white text-xs placeholder:text-slate-600 disabled:opacity-60 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        {isVerified ? (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/40">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="font-bold text-xs">
                  SKU Verification Verified &amp; Signed Off by Operator
                </div>
                <div className="text-[10px] text-emerald-400/80 font-mono">
                  {verificationResult?.verifiedAt ? new Date(verificationResult.verifiedAt).toLocaleTimeString() : 'Just now'} &bull; Ready for Physical Inspection
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() =>
                  onConfirmVerification({
                    verified: false,
                    verifiedBy: '',
                    verifiedAt: '',
                    status: 'PENDING',
                  })
                }
                className="text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700"
              >
                Re-open Verification
              </button>
              <button
                type="button"
                onClick={onProceedToPhysicalInspection}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shadow-emerald-950"
              >
                Proceed to Physical Inspection <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => handleVerify(isActiveSkuMatch ? 'PASS' : 'MANUAL_OVERRIDE')}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-cyan-950"
          >
            <ShieldCheck className="w-4 h-4" />
            Confirm &amp; Sign Off Manual SKU Verification
          </button>
        )}
      </div>
    </div>
  );
}
