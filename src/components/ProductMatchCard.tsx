import React from 'react';
import { Product, PurchaseOrderLine } from '../types';
import { CheckCircle2, AlertTriangle, XCircle, Package, ArrowRight, ShieldAlert, ExternalLink } from 'lucide-react';

interface ProductMatchCardProps {
  expectedLine: PurchaseOrderLine;
  poNumber: string;
  matchedProduct?: Product | null;
  scannedBarcode: string;
  barcodeFormat: string;
  matchStatus: 'PASS' | 'FAIL' | 'UNCERTAIN';
  onRequestManagerReview?: () => void;
  onLogException?: (reason: string) => void;
}

export function ProductMatchCard({
  expectedLine,
  poNumber,
  matchedProduct,
  scannedBarcode,
  barcodeFormat,
  matchStatus,
  onRequestManagerReview,
  onLogException,
}: ProductMatchCardProps) {
  const isSkuMatch = matchedProduct ? matchedProduct.sku.toUpperCase() === expectedLine.sku.toUpperCase() : false;
  const isGtinMatch = matchedProduct && expectedLine.gtin ? matchedProduct.gtin === expectedLine.gtin : null;

  return (
    <div className="w-full space-y-3 font-sans text-xs">
      {/* Top Match Verdict Banner */}
      <div
        className={`p-3.5 rounded-xl border flex items-start gap-3 transition ${
          matchStatus === 'PASS'
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
            : matchStatus === 'FAIL'
            ? 'bg-rose-950/50 border-rose-500/50 text-rose-200'
            : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
        }`}
      >
        <div className="shrink-0 mt-0.5">
          {matchStatus === 'PASS' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          {matchStatus === 'FAIL' && <XCircle className="w-5 h-5 text-rose-400" />}
          {matchStatus === 'UNCERTAIN' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
        </div>

        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold tracking-tight text-sm">
              {matchStatus === 'PASS' && 'PO Line Verified — PASS'}
              {matchStatus === 'FAIL' && 'Carton Barcode Mismatch — MISMATCH / EXCEPTION'}
              {matchStatus === 'UNCERTAIN' && 'Barcode Not Found in Catalogue — UNCERTAIN'}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 border border-white/10 uppercase">
              {barcodeFormat}
            </span>
          </div>

          <p className="text-xs leading-relaxed opacity-90">
            {matchStatus === 'PASS' &&
              `Scanned barcode "${scannedBarcode}" successfully resolved to SKU "${matchedProduct?.sku}", matching Purchase Order line ${expectedLine.sku}.`}
            {matchStatus === 'FAIL' &&
              `ALERT: Barcode resolves to SKU "${matchedProduct?.sku}" in product catalogue, which does NOT match PO line "${expectedLine.sku}". Do not accept shipment into expected inventory.`}
            {matchStatus === 'UNCERTAIN' &&
              `Barcode "${scannedBarcode}" is not catalogued in the warehouse database. Never assume product identity from appearance alone.`}
          </p>

          {/* Quick Action Buttons for Exception / Review */}
          {matchStatus === 'FAIL' && onLogException && (
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onLogException(`Wrong item scanned: Found SKU ${matchedProduct?.sku} instead of expected PO SKU ${expectedLine.sku}`)}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <ShieldAlert className="w-3.5 h-3.5" /> Log Wrong Item Exception
              </button>
            </div>
          )}

          {matchStatus === 'UNCERTAIN' && onRequestManagerReview && (
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onRequestManagerReview}
                className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Request Manager Review
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Side-by-Side Comparison Grid: Expected PO vs Scanned/Fetched Product */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Left Column: Expected PO Line */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-cyan-400" /> Expected PO Line
            </span>
            <span className="text-[11px] font-mono text-cyan-400 font-semibold">{poNumber}</span>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Expected SKU:</span>
              <span className="font-mono font-bold text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {expectedLine.sku}
              </span>
            </div>

            <div className="flex justify-between items-start">
              <span className="text-slate-500">Product Name:</span>
              <span className="font-medium text-slate-200 text-right max-w-[180px] truncate">
                {expectedLine.product_name}
              </span>
            </div>

            {expectedLine.gtin && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Target GTIN:</span>
                <span className="font-mono text-slate-300">{expectedLine.gtin}</span>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-slate-500">Cartons / Units/Box:</span>
              <span className="text-slate-300 font-medium">
                {expectedLine.expected_cartons} cartons &bull; {expectedLine.expected_units_per_carton} units/box
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500">Total Expected:</span>
              <span className="text-emerald-400 font-bold">
                {expectedLine.expected_units} total units
              </span>
            </div>

            {expectedLine.expected_variant && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Variant / Colour:</span>
                <span className="text-slate-300">
                  {expectedLine.expected_variant} {expectedLine.expected_colour ? `(${expectedLine.expected_colour})` : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Fetched Real Product from Catalogue */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-emerald-400" /> Catalogue Resolution
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                matchedProduct
                  ? isSkuMatch
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {matchedProduct ? (isSkuMatch ? 'SKU MATCH' : 'SKU MISMATCH') : 'UNREGISTERED'}
            </span>
          </div>

          {matchedProduct ? (
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Catalogued SKU:</span>
                <span
                  className={`font-mono font-bold px-2 py-0.5 rounded border ${
                    isSkuMatch
                      ? 'bg-slate-950 text-emerald-300 border-emerald-800/60'
                      : 'bg-rose-950/60 text-rose-300 border-rose-800'
                  }`}
                >
                  {matchedProduct.sku}
                </span>
              </div>

              <div className="flex justify-between items-start">
                <span className="text-slate-500">Product Name:</span>
                <span className="font-medium text-slate-200 text-right max-w-[180px] truncate">
                  {matchedProduct.product_name}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Master GTIN:</span>
                <span className="font-mono text-slate-300">{matchedProduct.gtin}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Units / Carton:</span>
                <span className="text-slate-300 font-medium">
                  {matchedProduct.expected_units_per_carton} units/box
                  {matchedProduct.expected_units_per_carton !== expectedLine.expected_units_per_carton && (
                    <span className="text-rose-400 ml-1 font-bold">
                      (Differs from PO: {expectedLine.expected_units_per_carton})
                    </span>
                  )}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Variant / Colour:</span>
                <span className="text-slate-300">
                  {matchedProduct.variant || 'Standard'} {matchedProduct.colour ? `(${matchedProduct.colour})` : ''}
                </span>
              </div>

              {matchedProduct.required_components && matchedProduct.required_components.length > 0 && (
                <div className="flex justify-between items-center pt-1 border-t border-slate-800/60">
                  <span className="text-slate-500">Components:</span>
                  <span className="text-slate-400 text-[11px] truncate max-w-[180px]">
                    {matchedProduct.required_components.join(' · ')}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="py-4 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-amber-400/80 mx-auto" />
              <div className="text-xs font-semibold text-slate-300">No Product Found in Catalogue</div>
              <p className="text-[11px] text-slate-500 leading-relaxed max-w-xs mx-auto">
                No active SKU in the warehouse database matches barcode &ldquo;{scannedBarcode}&rdquo;.
                Add this product to the catalogue or verify the shipping label.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
