import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle, Clock, FileText, ChevronRight } from 'lucide-react';
import { ExceptionItem } from '../types';

interface ExceptionsQueueProps {
  exceptions: ExceptionItem[];
  onUpdateStatus: (id: string, status: ExceptionItem['status'], notes?: string) => void;
}

export function ExceptionsQueue({ exceptions, onUpdateStatus }: ExceptionsQueueProps) {
  const [selectedException, setSelectedException] = useState<ExceptionItem | null>(null);
  const [managerNotes, setManagerNotes] = useState('');

  const openCount = exceptions.filter((e) => e.status === 'OPEN').length;
  const quarantinedCount = exceptions.filter((e) => e.status === 'QUARANTINED').length;
  const claimsCount = exceptions.filter((e) => e.status === 'SUPPLIER_CLAIM').length;

  const handleAction = (status: ExceptionItem['status']) => {
    if (!selectedException) return;
    onUpdateStatus(selectedException.id, status, managerNotes || selectedException.notes);
    setSelectedException(null);
    setManagerNotes('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
            Exceptions &amp; Quarantine Queue
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Triage damaged cartons, short shipments, SKU mismatches, and initiate vendor claims.
          </p>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 font-semibold">Active Open Issues</span>
          <div className="text-2xl font-bold text-rose-400 mt-1">{openCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 font-semibold">Quarantined Cartons</span>
          <div className="text-2xl font-bold text-amber-400 mt-1">{quarantinedCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 font-semibold">Supplier Claims In Progress</span>
          <div className="text-2xl font-bold text-cyan-400 mt-1">{claimsCount}</div>
        </div>
      </div>

      {/* Exceptions List */}
      {exceptions.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-2">
          <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
          <h3 className="text-sm font-bold text-white">No Exceptions Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            All shipments in the warehouse have been processed cleanly without active discrepancies.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="divide-y divide-slate-800 text-xs">
            {exceptions.map((exc) => (
              <div
                key={exc.id}
                onClick={() => {
                  setSelectedException(exc);
                  setManagerNotes(exc.notes || '');
                }}
                className="p-4 hover:bg-slate-800/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        exc.severity === 'HIGH'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {exc.severity} SEVERITY
                    </span>
                    <strong className="text-white text-xs">{exc.issue_type}</strong>
                  </div>
                  <div className="text-slate-400 text-xs">
                    PO: <span className="text-slate-200 font-mono">{exc.po_number || 'N/A'}</span> &bull; SKU:{' '}
                    <span className="text-cyan-400 font-mono">{exc.product_sku}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                      exc.status === 'OPEN'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : exc.status === 'QUARANTINED'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : exc.status === 'SUPPLIER_CLAIM'
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    }`}
                  >
                    {exc.status.replace(/_/g, ' ')}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exception Detail & Triage Modal */}
      {selectedException && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                Triage Exception: {selectedException.issue_type}
              </h3>
              <button onClick={() => setSelectedException(null)} className="text-slate-400 hover:text-white">
                &times;
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-lg text-xs space-y-2 font-mono">
              <div>
                <span className="text-slate-500">Purchase Order:</span>{' '}
                <span className="text-white font-bold">{selectedException.po_number || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500">Affected SKU:</span>{' '}
                <span className="text-cyan-400">{selectedException.product_sku}</span>
              </div>
              <div>
                <span className="text-slate-500">Severity:</span>{' '}
                <span className="text-rose-400 font-bold">{selectedException.severity}</span>
              </div>
              <div>
                <span className="text-slate-500">Recorded At:</span>{' '}
                <span className="text-slate-300">{new Date(selectedException.created_at).toLocaleString()}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Manager Investigation Notes:</label>
              <textarea
                rows={3}
                value={managerNotes}
                onChange={(e) => setManagerNotes(e.target.value)}
                placeholder="Log quarantine location or vendor communication notes..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-2 pt-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleAction('QUARANTINED')}
                className="bg-amber-600 hover:bg-amber-500 text-white p-2.5 rounded-lg transition"
              >
                Quarantine
              </button>
              <button
                type="button"
                onClick={() => handleAction('SUPPLIER_CLAIM')}
                className="bg-cyan-600 hover:bg-cyan-500 text-white p-2.5 rounded-lg transition"
              >
                Start Claim
              </button>
              <button
                type="button"
                onClick={() => handleAction('RESOLVED')}
                className="bg-emerald-600 hover:bg-emerald-500 text-white p-2.5 rounded-lg transition"
              >
                Resolve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
