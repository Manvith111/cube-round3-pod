import React, { useState } from 'react';
import { X, Building2 } from 'lucide-react';
import { Supplier } from '../types';

interface AddSupplierModalProps {
  onSave: (supplier: Omit<Supplier, 'id' | 'created_at'>) => void;
  onClose: () => void;
}

export function AddSupplierModal({ onSave, onClose }: AddSupplierModalProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [claimProcess, setClaimProcess] = useState('Standard Return Merchandise Authorization (RMA) within 5 business days.');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;

    onSave({
      supplier_code: code.trim().toUpperCase(),
      supplier_name: name.trim(),
      contact_name: contactName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      preferred_claim_process: claimProcess.trim() || undefined,
      active: true,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-400" />
            Add Warehouse Supplier
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="text-slate-300 font-semibold block mb-1">Supplier Code *</label>
            <input
              type="text"
              required
              placeholder="e.g. SUP-AQUA"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono uppercase"
            />
          </div>

          <div>
            <label className="text-slate-300 font-semibold block mb-1">Supplier Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Aquatic Industries Ltd."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Contact Person</label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
              />
            </div>
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Contact Email</label>
              <input
                type="email"
                placeholder="orders@vendor.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-300 font-semibold block mb-1">Preferred Claim Process</label>
            <textarea
              rows={2}
              value={claimProcess}
              onChange={(e) => setClaimProcess(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-4 py-2 rounded-lg text-xs transition"
            >
              Save Supplier
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
