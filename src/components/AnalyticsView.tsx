import React from 'react';
import { BarChart3, TrendingUp, CheckCircle, AlertTriangle, ShieldAlert, Package, Clock } from 'lucide-react';
import { Inspection, ExceptionItem, Supplier } from '../types';

interface AnalyticsViewProps {
  inspections: Inspection[];
  exceptions: ExceptionItem[];
  suppliers: Supplier[];
}

export function AnalyticsView({ inspections, exceptions, suppliers }: AnalyticsViewProps) {
  if (inspections.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3 max-w-xl mx-auto my-12">
        <div className="w-12 h-12 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto mb-2">
          <BarChart3 className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-white">No Inspection Activity Yet</h2>
        <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
          Create a Purchase Order and complete your first shipment inspection to view live analytics,
          accuracy metrics, and vendor performance rankings.
        </p>
      </div>
    );
  }

  // Calculate real metrics from user data
  const total = inspections.length;
  const accepted = inspections.filter((i) => i.status === 'ACCEPT').length;
  const exceptionCount = inspections.filter((i) => i.status === 'EXCEPTION').length;
  const reviewRequired = inspections.filter((i) => i.status === 'REVIEW_REQUIRED').length;

  const acceptRate = Math.round((accepted / total) * 100);
  const exceptionRate = Math.round((exceptionCount / total) * 100);
  const uncertaintyRate = Math.round((reviewRequired / total) * 100);

  // Barcode success rate
  let totalScans = 0;
  let passedScans = 0;
  inspections.forEach((i) => {
    (i.barcode_scans || []).forEach((s) => {
      totalScans++;
      if (s.match_status === 'PASS') passedScans++;
    });
  });
  const barcodeSuccessRate = totalScans > 0 ? Math.round((passedScans / totalScans) * 100) : 100;

  // SKU exception ranking
  const skuExceptionsMap: Record<string, number> = {};
  exceptions.forEach((e) => {
    skuExceptionsMap[e.product_sku] = (skuExceptionsMap[e.product_sku] || 0) + 1;
  });
  const skuRanking = Object.entries(skuExceptionsMap).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-cyan-400" />
          Warehouse Receiving Intelligence &amp; Metrics
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Real-time metrics computed exclusively from actual received shipments.
        </p>
      </div>

      {/* Top Level Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-slate-400 font-semibold">Total Received</span>
          <div className="text-2xl font-bold text-white mt-1">{total}</div>
          <span className="text-[10px] text-slate-500">Live inspections</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-slate-400 font-semibold">Acceptance Rate</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{acceptRate}%</div>
          <span className="text-[10px] text-slate-500">{accepted} clean receipts</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-slate-400 font-semibold">Exception Rate</span>
          <div className="text-2xl font-bold text-rose-400 mt-1">{exceptionRate}%</div>
          <span className="text-[10px] text-slate-500">{exceptionCount} issues flagged</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-slate-400 font-semibold">Barcode Accuracy</span>
          <div className="text-2xl font-bold text-cyan-400 mt-1">{barcodeSuccessRate}%</div>
          <span className="text-[10px] text-slate-500">{passedScans}/{totalScans} verified</span>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Verification Breakdown */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4">
          <h3 className="font-bold text-white text-sm">Receiving Outcomes Distribution</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-emerald-400 font-medium">Accepted ({accepted})</span>
                <span className="text-slate-400">{acceptRate}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${acceptRate}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-rose-400 font-medium">Exceptions ({exceptionCount})</span>
                <span className="text-slate-400">{exceptionRate}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-rose-500 h-full rounded-full" style={{ width: `${exceptionRate}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-amber-400 font-medium">Review Required ({reviewRequired})</span>
                <span className="text-slate-400">{uncertaintyRate}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${uncertaintyRate}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Top Exception SKUs */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4">
          <h3 className="font-bold text-white text-sm">Product SKU Exception Ranking</h3>
          {skuRanking.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No SKU discrepancies recorded.</p>
          ) : (
            <div className="space-y-2">
              {skuRanking.slice(0, 5).map(([sku, count]) => (
                <div
                  key={sku}
                  className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between"
                >
                  <span className="font-mono text-cyan-300 font-semibold">{sku}</span>
                  <span className="text-rose-400 font-bold">{count} incident(s)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
