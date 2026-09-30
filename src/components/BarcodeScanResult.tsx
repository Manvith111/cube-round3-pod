import React from 'react';
import { BarcodeScan, Product, PurchaseOrderLine } from '../types';
import { ProductMatchCard } from './ProductMatchCard';
import { RefreshCw, ArrowRight, ShieldAlert, CheckCircle, AlertTriangle, Keyboard, Camera, Clock } from 'lucide-react';

interface BarcodeScanResultProps {
  scan: BarcodeScan;
  expectedLine: PurchaseOrderLine;
  poNumber: string;
  matchedProduct?: Product | null;
  onConfirm: () => void;
  onRescan: () => void;
  onManualFallback: () => void;
  onRequestManagerReview?: () => void;
  onLogException?: (reason: string) => void;
}

export function BarcodeScanResult({
  scan,
  expectedLine,
  poNumber,
  matchedProduct,
  onConfirm,
  onRescan,
  onManualFallback,
  onRequestManagerReview,
  onLogException,
}: BarcodeScanResultProps) {
  const isPass = scan.match_status === 'PASS';
  const isFail = scan.match_status === 'FAIL';
  const isUncertain = scan.match_status === 'UNCERTAIN';

  return (
    <div className="w-full space-y-4 font-sans text-xs">
      {/* Top Meta Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {scan.scan_source === 'CAMERA_SCAN' ? (
            <div className="flex items-center gap-1.5 text-cyan-400 font-semibold text-xs">
              <Camera className="w-3.5 h-3.5" /> Real-Time Camera Scan
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold text-xs">
              <Keyboard className="w-3.5 h-3.5" /> Manual Barcode Entry
            </div>
          )}
          <span className="text-slate-600">&bull;</span>
          <span className="text-slate-400 font-mono text-[11px] uppercase">
            {scan.barcode_format || 'DETECTED BARCODE'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
          <Clock className="w-3 h-3" />
          <span>{new Date(scan.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
      </div>

      {/* Product Match Card */}
      <ProductMatchCard
        expectedLine={expectedLine}
        poNumber={poNumber}
        matchedProduct={matchedProduct}
        scannedBarcode={scan.barcode_value}
        barcodeFormat={scan.barcode_format}
        matchStatus={scan.match_status}
        onRequestManagerReview={onRequestManagerReview}
        onLogException={onLogException}
      />

      {/* Action Buttons Toolbar */}
      <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
        <button
          type="button"
          onClick={onRescan}
          className="w-full sm:w-auto flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" /> Rescan Barcode
        </button>

        <button
          type="button"
          onClick={onManualFallback}
          className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 py-2.5 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <Keyboard className="w-3.5 h-3.5 text-cyan-400" /> Manual Input
        </button>

        {/* Primary Proceed Button */}
        <button
          type="button"
          onClick={onConfirm}
          className={`w-full sm:w-auto flex-1 py-2.5 px-5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-md ${
            isPass
              ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-950/50'
              : isFail
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50'
              : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-950/50'
          }`}
        >
          {isPass && (
            <>
              Confirm & Continue to Photos <ArrowRight className="w-4 h-4" />
            </>
          )}
          {isFail && (
            <>
              Accept Discrepancy & Continue <ArrowRight className="w-4 h-4" />
            </>
          )}
          {isUncertain && (
            <>
              Continue with Uncertain Barcode <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
