import React from 'react';
import { Building2, Plus, Mail, Phone } from 'lucide-react';
import { Supplier } from '../types';

interface SuppliersViewProps {
  suppliers: Supplier[];
  onAddSupplier: () => void;
}

export function SuppliersView({ suppliers, onAddSupplier }: SuppliersViewProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-400" />
            Warehouse Suppliers &amp; Vendors
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Registered suppliers, preferred RMA claim terms, and direct logistics contacts.
          </p>
        </div>

        <button
          onClick={onAddSupplier}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition shadow-lg shadow-blue-950 self-start sm:self-center"
        >
          <Plus className="w-3.5 h-3.5" /> Add Supplier
        </button>
      </div>

      {suppliers.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400 text-xs">
          No suppliers registered yet. Click &quot;Add Supplier&quot; to begin.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suppliers.map((s) => (
            <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-cyan-400 font-bold text-[11px]">{s.supplier_code}</span>
                  <h3 className="text-sm font-bold text-white mt-0.5">{s.supplier_name}</h3>
                </div>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold">
                  ACTIVE
                </span>
              </div>

              {(s.email || s.phone || s.contact_name) && (
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1 text-slate-300">
                  {s.contact_name && <div>Contact: <strong className="text-white">{s.contact_name}</strong></div>}
                  {s.email && (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Mail className="w-3 h-3 text-cyan-400" /> {s.email}
                    </div>
                  )}
                  {s.phone && (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Phone className="w-3 h-3 text-cyan-400" /> {s.phone}
                    </div>
                  )}
                </div>
              )}

              {s.preferred_claim_process && (
                <div className="text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300">RMA Claim Process:</span>{' '}
                  {s.preferred_claim_process}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
