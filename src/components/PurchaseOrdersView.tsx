import React, { useState } from 'react';
import { FileSpreadsheet, Plus, Download, ChevronDown, ChevronRight, Package, Calendar } from 'lucide-react';
import { PurchaseOrder } from '../types';
import { downloadPurchaseOrdersCsvTemplate } from '../lib/csvHelper';

interface PurchaseOrdersViewProps {
  purchaseOrders: PurchaseOrder[];
  onCreatePO: () => void;
  onImportCsv: () => void;
  onSelectInspectLine?: (po: PurchaseOrder, lineSku: string) => void;
}

export function PurchaseOrdersView({
  purchaseOrders,
  onCreatePO,
  onImportCsv,
  onSelectInspectLine,
}: PurchaseOrdersViewProps) {
  const [expandedPoId, setExpandedPoId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedPoId(expandedPoId === id ? null : id);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            Inbound Purchase Orders
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Active inbound shipments against which carton barcodes and quantities are validated.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={downloadPurchaseOrdersCsvTemplate}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 transition"
          >
            <Download className="w-3.5 h-3.5" /> Template
          </button>
          <button
            onClick={onImportCsv}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Import CSV
          </button>
          <button
            onClick={onCreatePO}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition shadow-lg shadow-emerald-950"
          >
            <Plus className="w-3.5 h-3.5" /> Create PO
          </button>
        </div>
      </div>

      {/* PO List */}
      {purchaseOrders.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400 text-xs">
          No Purchase Orders found. Click &quot;Create PO&quot; or &quot;Import CSV&quot; to begin.
        </div>
      ) : (
        <div className="space-y-3">
          {purchaseOrders.map((po) => {
            const isExpanded = expandedPoId === po.id;
            return (
              <div key={po.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden transition">
                <div
                  onClick={() => toggleExpand(po.id)}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-800/40"
                >
                  <div className="flex items-center gap-3">
                    <button className="text-slate-500 hover:text-white">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-white text-sm font-mono">{po.po_number}</strong>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                          {po.status}
                        </span>
                      </div>
                      <div className="text-slate-400 text-xs mt-0.5">
                        Supplier: <span className="text-slate-200">{po.supplier_name || 'Vendor'}</span> &bull;{' '}
                        {po.lines.length} Line Item(s)
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    {po.expected_arrival_date && (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span>{po.expected_arrival_date}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded Lines */}
                {isExpanded && (
                  <div className="bg-slate-950/60 p-4 border-t border-slate-800/80 text-xs space-y-2">
                    <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                      Expected Product Line Items:
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {po.lines.map((line) => (
                        <div
                          key={line.id}
                          className="bg-slate-900 p-3 rounded-lg border border-slate-800 flex items-center justify-between"
                        >
                          <div>
                            <div className="font-mono text-cyan-300 font-bold">{line.sku}</div>
                            <div className="text-slate-300 text-[11px]">{line.product_name}</div>
                          </div>
                          <div className="text-right font-mono text-xs">
                            <span className="text-slate-400">
                              {line.expected_cartons} bxs &times; {line.expected_units_per_carton} units ={' '}
                            </span>
                            <strong className="text-emerald-400 font-bold">{line.expected_units} total</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
