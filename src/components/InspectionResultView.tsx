import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Download,
  Printer,
  ShieldAlert,
  RotateCcw,
  Check,
  UserCheck,
  ChevronDown,
  Filter,
  Eye,
  X,
} from 'lucide-react';
import { Inspection, InspectionCheck, InspectionPhoto, UserRole } from '../types';
import { openInspectionReport, downloadInspectionReport } from '../lib/reportGenerator';

interface InspectionResultViewProps {
  inspection: Inspection;
  userRole: UserRole;
  onRetakeEvidence: () => void;
  onRequestManagerReview: () => void;
  onManagerOverride: (newStatus: Inspection['status'], reason: string) => void;
  onQuarantine: () => void;
  onBackToDashboard: () => void;
}

export function InspectionResultView({
  inspection,
  userRole,
  onRetakeEvidence,
  onRequestManagerReview,
  onManagerOverride,
  onQuarantine,
  onBackToDashboard,
}: InspectionResultViewProps) {
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideStatus, setOverrideStatus] = useState<Inspection['status']>('ACCEPT');
  const [overrideReason, setOverrideReason] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<InspectionPhoto | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');

  const status = inspection.status;

  const exportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(inspection, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `inspection_${inspection.po_number}_${inspection.product_sku}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handlePrint = () => {
    window.print();
  };

  const submitOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideReason.trim()) return;
    onManagerOverride(overrideStatus, overrideReason);
    setOverrideModalOpen(false);
  };

  const filteredPhotos = inspection.photos.filter((p) => {
    if (filterType === 'ALL') return true;
    if (filterType === 'LABEL') return p.photo_type === 'BARCODE_LABEL';
    if (filterType === 'CARTON') return p.photo_type.startsWith('CARTON_') || p.photo_type === 'SHIPMENT_OVERVIEW';
    if (filterType === 'DAMAGE') return p.photo_type === 'DAMAGE_CLOSEUP';
    return true;
  });

  return (
    <div className="space-y-6 pb-20 print:p-0 print:space-y-4">
      {/* Top Banner Status */}
      <div
        className={`p-6 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg ${
          status === 'ACCEPT'
            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-100'
            : status === 'EXCEPTION'
            ? 'bg-rose-950/40 border-rose-800 text-rose-100'
            : 'bg-amber-950/40 border-amber-800 text-amber-100'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-full bg-black/40">
            {status === 'ACCEPT' && <CheckCircle2 className="w-10 h-10 text-emerald-400" />}
            {status === 'EXCEPTION' && <XCircle className="w-10 h-10 text-rose-400" />}
            {status === 'REVIEW_REQUIRED' && <AlertTriangle className="w-10 h-10 text-amber-400" />}
          </div>
          <div>
            <div className="text-xs font-semibold tracking-widest uppercase opacity-80">
              Inspection Verdict
            </div>
            <div className="text-2xl md:text-3xl font-bold tracking-tight">
              {status === 'ACCEPT' && 'ACCEPT SHIPMENT'}
              {status === 'EXCEPTION' && 'RECEIVING EXCEPTION'}
              {status === 'REVIEW_REQUIRED' && 'REVIEW REQUIRED (UNCERTAIN)'}
            </div>
            <p className="text-xs md:text-sm opacity-90 mt-1 max-w-2xl">
              {inspection.action_recommendation ||
                (status === 'ACCEPT'
                  ? 'Accept shipment into inventory.'
                  : status === 'EXCEPTION'
                  ? 'Quarantine affected carton(s), preserve evidence, and initiate supplier review.'
                  : 'Do not accept automatically. Retake missing evidence or request manager verification.')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 print:hidden self-end md:self-center">
          <button
            onClick={exportJson}
            className="flex items-center gap-1.5 bg-slate-900/80 hover:bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 transition"
          >
            <Download className="w-3.5 h-3.5" /> Export JSON
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-slate-900/80 hover:bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 transition"
          >
            <Printer className="w-3.5 h-3.5" /> Print Report
          </button>
        </div>
      </div>

      {/* Shipment & PO Metadata Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-slate-500">Purchase Order:</span>
          <div className="font-bold text-white text-sm font-mono mt-0.5">{inspection.po_number}</div>
        </div>
        <div>
          <span className="text-slate-500">Product SKU:</span>
          <div className="font-bold text-cyan-400 text-sm font-mono mt-0.5">{inspection.product_sku}</div>
        </div>
        <div>
          <span className="text-slate-500">Product Name:</span>
          <div className="font-semibold text-slate-200 truncate mt-0.5">{inspection.product_name}</div>
        </div>
        <div>
          <span className="text-slate-500">Operating Mode:</span>
          <div className="font-bold text-amber-400 mt-0.5">{inspection.mode}</div>
        </div>
        <div>
          <span className="text-slate-500">Observed Cartons:</span>
          <div className="font-semibold text-slate-200 mt-0.5">{inspection.observed_carton_count ?? 'Unverified'}</div>
        </div>
        <div>
          <span className="text-slate-500">Total Units:</span>
          <div className="font-semibold text-slate-200 mt-0.5">{inspection.observed_total_quantity ?? 'Unverified'}</div>
        </div>
        <div>
          <span className="text-slate-500">Operator:</span>
          <div className="font-semibold text-slate-200 mt-0.5">{inspection.operator_name || 'Receiving Operator'}</div>
        </div>
        <div>
          <span className="text-slate-500">Inspection Time:</span>
          <div className="font-semibold text-slate-200 mt-0.5">
            {new Date(inspection.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Manual SKU Verification Sign-Off Status */}
      {inspection.manual_sku_verified && (
        <div className="bg-emerald-950/30 border border-emerald-500/30 p-3.5 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5 text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold">Manual SKU PO Cross-Reference Verified</span>
              {inspection.manual_sku_notes && (
                <span className="text-slate-400 block text-[11px] mt-0.5">
                  Dock Notes: &ldquo;{inspection.manual_sku_notes}&rdquo;
                </span>
              )}
            </div>
          </div>
          <div className="text-right font-mono text-[10px] text-emerald-400">
            <span>Verified by {inspection.manual_sku_verified_by || 'Receiving Operator'}</span>
            {inspection.manual_sku_verified_at && (
              <span className="block text-slate-500">
                {new Date(inspection.manual_sku_verified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Expected vs Observed Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            Receiving Verification Matrix (10 Checks)
          </h2>
          <span className="text-xs text-slate-400 font-mono">
            {inspection.checks.filter((c) => c.verdict === 'PASS').length}/10 Passed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Inspection Check</th>
                <th className="py-3 px-4">Expected PO Spec</th>
                <th className="py-3 px-4">Observed In Shipment</th>
                <th className="py-3 px-4">Verdict</th>
                <th className="py-3 px-4">Confidence</th>
                <th className="py-3 px-4">Evidence Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {inspection.checks.map((ch) => (
                <tr key={ch.check_name} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-4 font-semibold text-slate-200">
                    {ch.check_name.replace(/_/g, ' ')}
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    {typeof ch.expected_value === 'object'
                      ? JSON.stringify(ch.expected_value)
                      : String(ch.expected_value || 'N/A')}
                  </td>
                  <td className="py-3 px-4 text-slate-200">
                    {typeof ch.observed_value === 'object'
                      ? JSON.stringify(ch.observed_value)
                      : String(ch.observed_value || 'Unstated')}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-[11px] ${
                        ch.verdict === 'PASS'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : ch.verdict === 'FAIL'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {ch.verdict === 'PASS' && <CheckCircle2 className="w-3 h-3" />}
                      {ch.verdict === 'FAIL' && <XCircle className="w-3 h-3" />}
                      {ch.verdict === 'UNCERTAIN' && <AlertTriangle className="w-3 h-3" />}
                      {ch.verdict}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    {(ch.confidence * 100).toFixed(0)}%
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-sans max-w-xs leading-normal">
                    {ch.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Photographic Evidence Gallery */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Eye className="w-4 h-4 text-cyan-400" />
            Photographic Evidence Vault ({inspection.photos.length} Photos)
          </h2>
          {/* Gallery Filters */}
          <div className="flex items-center gap-1 text-xs">
            {['ALL', 'LABEL', 'CARTON', 'DAMAGE'].map((filter) => (
              <button
                key={filter}
                onClick={() => setFilterType(filter)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                  filterType === filter
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {filteredPhotos.map((photo) => (
            <div
              key={photo.id}
              onClick={() => setSelectedPhoto(photo)}
              className="group relative aspect-square bg-black rounded-lg overflow-hidden border border-slate-800 hover:border-cyan-500 transition cursor-pointer"
            >
              {photo.base64 ? (
                <img
                  src={photo.base64}
                  alt={photo.photo_type}
                  className="w-full h-full object-cover group-hover:scale-105 transition"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500">
                  {photo.file_name}
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-1.5">
                <span className="text-[10px] text-slate-200 font-semibold truncate">
                  {photo.photo_type.replace(/_/g, ' ')}
                </span>
                <span className="text-[9px] text-slate-400">
                  {photo.quality_status === 'GOOD' ? 'Verified' : photo.quality_status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-4 print:hidden">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onBackToDashboard}
            className="text-xs text-slate-400 hover:text-white transition"
          >
            &larr; Back to Dashboard
          </button>

          <div className="flex items-center gap-2">
            {status !== 'ACCEPT' && (
              <button
                onClick={onRetakeEvidence}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium px-4 py-2 rounded-lg text-xs transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Retake Evidence
              </button>
            )}

            {userRole === 'RECEIVING_OPERATOR' && status === 'REVIEW_REQUIRED' && (
              <button
                onClick={onRequestManagerReview}
                className="bg-amber-600 hover:bg-amber-500 text-white font-semibold px-4 py-2 rounded-lg text-xs transition flex items-center gap-1.5"
              >
                <UserCheck className="w-3.5 h-3.5" /> Request Manager Review
              </button>
            )}

            {status === 'EXCEPTION' && (
              <button
                onClick={onQuarantine}
                className="bg-rose-600 hover:bg-rose-500 text-white font-semibold px-4 py-2 rounded-lg text-xs transition flex items-center gap-1.5 shadow-lg shadow-rose-950"
              >
                <ShieldAlert className="w-3.5 h-3.5" /> Quarantine Shipment
              </button>
            )}

            {/* Manager Override Action */}
            {userRole === 'RECEIVING_MANAGER' && (
              <button
                onClick={() => setOverrideModalOpen(true)}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-4 py-2 rounded-lg text-xs transition flex items-center gap-1.5 shadow-lg shadow-cyan-950"
              >
                Manager Decision Override
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Full-screen Photo Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          <div className="relative max-w-3xl w-full flex flex-col items-center">
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute -top-10 right-0 text-slate-400 hover:text-white p-2"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-black max-h-[80vh]">
              <img
                src={selectedPhoto.base64}
                alt={selectedPhoto.photo_type}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="text-center mt-3 text-xs text-slate-300">
              <strong className="text-white">{selectedPhoto.photo_type.replace(/_/g, ' ')}</strong>
              {' &bull; '}
              <span>SHA-256: {selectedPhoto.sha256_hash.substring(0, 16)}...</span>
            </div>
          </div>
        </div>
      )}

      {/* Manager Override Modal */}
      {overrideModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-cyan-400" />
                Manager Decision Override
              </h3>
              <button
                onClick={() => setOverrideModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitOverride} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Select New Status:</label>
                <select
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                >
                  <option value="ACCEPT">ACCEPT (Approve Shipment into Inventory)</option>
                  <option value="EXCEPTION">EXCEPTION (Reject or Quarantine Shipment)</option>
                  <option value="REVIEW_REQUIRED">REVIEW REQUIRED (Request Re-inspection)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Mandatory Manager Justification Reason:
                </label>
                <textarea
                  rows={4}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Explain why this decision is being modified (e.g. verified carton label in person; vendor authorized variance)."
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="text-[11px] text-slate-400 bg-slate-950 p-2.5 rounded border border-slate-800">
                Notice: This action will be permanently recorded in the immutable audit ledger with your manager identity and timestamp.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOverrideModalOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!overrideReason.trim()}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-4 py-2 rounded-lg text-xs disabled:opacity-50 transition"
                >
                  Commit Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
