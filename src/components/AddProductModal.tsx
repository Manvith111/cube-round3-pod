import React, { useState } from 'react';
import { X, PackagePlus } from 'lucide-react';
import { Product, Supplier } from '../types';

interface AddProductModalProps {
  suppliers: Supplier[];
  onSave: (product: Omit<Product, 'id' | 'created_at'>) => void;
  onClose: () => void;
}

export function AddProductModal({ suppliers, onSave, onClose }: AddProductModalProps) {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [gtin, setGtin] = useState('');
  const [variant, setVariant] = useState('Standard');
  const [colour, setColour] = useState('');
  const [unitsPerCarton, setUnitsPerCarton] = useState(12);
  const [supplierId, setSupplierId] = useState('');
  const [components, setComponents] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim() || !name.trim() || !gtin.trim() || unitsPerCarton <= 0) return;

    onSave({
      sku: sku.trim().toUpperCase(),
      product_name: name.trim(),
      gtin: gtin.trim(),
      variant: variant.trim() || 'Standard',
      colour: colour.trim() || 'N/A',
      expected_units_per_carton: Number(unitsPerCarton),
      supplier_id: supplierId || undefined,
      required_components: components ? components.split(',').map((s) => s.trim()) : undefined,
      description: description.trim() || undefined,
      active: true,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <PackagePlus className="w-4 h-4 text-cyan-400" />
            Add Product Catalogue Item
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Product SKU *</label>
              <input
                type="text"
                required
                placeholder="e.g. BOTTLE-BLUE-01"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono uppercase"
              />
            </div>
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Barcode / GTIN-13 *</label>
              <input
                type="text"
                required
                placeholder="e.g. 08901234567890"
                value={gtin}
                onChange={(e) => setGtin(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-300 font-semibold block mb-1">Product Full Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. HydroGuard 750ml Insulated Water Bottle"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Variant</label>
              <input
                type="text"
                placeholder="750ml Standard"
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
              />
            </div>
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Colour</label>
              <input
                type="text"
                placeholder="Deep Blue"
                value={colour}
                onChange={(e) => setColour(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
              />
            </div>
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Units / Carton *</label>
              <input
                type="number"
                required
                min={1}
                value={unitsPerCarton}
                onChange={(e) => setUnitsPerCarton(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
              />
            </div>
          </div>

          {suppliers.length > 0 && (
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Default Supplier</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
              >
                <option value="">-- Optional: Select Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.supplier_name} ({s.supplier_code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-slate-300 font-semibold block mb-1">
              Required Components (comma-separated)
            </label>
            <input
              type="text"
              placeholder="e.g. Bottle Body, Screw Lid, Carabiner Clip"
              value={components}
              onChange={(e) => setComponents(e.target.value)}
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
              Save Product
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
