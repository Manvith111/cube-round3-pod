import React, { useState } from 'react';
import { X, PackagePlus, AlertCircle, Sparkles, Check } from 'lucide-react';
import { PurchaseOrderLine, Product } from '../types';

interface ManualSkuModalProps {
  initialValues?: Partial<PurchaseOrderLine>;
  catalogProducts?: Product[];
  onSave: (skuData: Omit<PurchaseOrderLine, 'id' | 'purchase_order_id'>) => void;
  onClose: () => void;
}

export function ManualSkuModal({
  initialValues,
  catalogProducts = [],
  onSave,
  onClose,
}: ManualSkuModalProps) {
  const [sku, setSku] = useState(initialValues?.sku || '');
  const [productName, setProductName] = useState(initialValues?.product_name || '');
  const [gtin, setGtin] = useState(initialValues?.gtin || '');
  const [productFamily, setProductFamily] = useState(initialValues?.product_family || 'Standard Inventory');
  const [expectedCartons, setExpectedCartons] = useState<number>(initialValues?.expected_cartons || 10);
  const [unitsPerCarton, setUnitsPerCarton] = useState<number>(initialValues?.expected_units_per_carton || 12);
  const [variant, setVariant] = useState(initialValues?.expected_variant || '');
  const [colour, setColour] = useState(initialValues?.expected_colour || '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const totalExpectedUnits = Math.max(1, expectedCartons) * Math.max(1, unitsPerCarton);

  const handleSelectFromCatalog = (catalogSku: string) => {
    const prod = catalogProducts.find((p) => p.sku === catalogSku);
    if (!prod) return;
    setSku(prod.sku);
    setProductName(prod.product_name);
    setGtin(prod.gtin || '');
    if (prod.product_family) setProductFamily(prod.product_family);
    if (prod.expected_units_per_carton) setUnitsPerCarton(prod.expected_units_per_carton);
    if (prod.variant) setVariant(prod.variant);
    if (prod.colour) setColour(prod.colour);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim()) {
      setValidationError('SKU identifier is required (e.g. SKU-1002).');
      return;
    }
    if (!productName.trim()) {
      setValidationError('Product title / description is required.');
      return;
    }
    if (expectedCartons < 1) {
      setValidationError('Expected cartons must be at least 1.');
      return;
    }
    if (unitsPerCarton < 1) {
      setValidationError('Units per carton must be at least 1.');
      return;
    }

    setValidationError(null);
    onSave({
      sku: sku.trim().toUpperCase(),
      product_name: productName.trim(),
      gtin: gtin.trim(),
      expected_cartons: Number(expectedCartons),
      expected_units_per_carton: Number(unitsPerCarton),
      expected_units: totalExpectedUnits,
      expected_variant: variant.trim() || undefined,
      expected_colour: colour.trim() || undefined,
      product_family: productFamily.trim() || undefined,
      is_manual: true,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <PackagePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {initialValues?.sku ? 'Edit Inbound SKU Specifications' : 'Manual SKU Details Entry'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Specify manual product parameters for receiving verification
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Quick populate helper from master catalogue if available */}
          {catalogProducts.length > 0 && !initialValues?.sku && (
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
              <label className="text-[10px] text-cyan-400 font-semibold tracking-wider uppercase block mb-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Quick Autofill from Master Catalog
              </label>
              <select
                onChange={(e) => handleSelectFromCatalog(e.target.value)}
                defaultValue=""
                className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-300 font-mono text-[11px]"
              >
                <option value="" disabled>
                  Select existing catalog product to autofill...
                </option>
                {catalogProducts.map((p) => (
                  <option key={p.id} value={p.sku}>
                    {p.sku} &bull; {p.product_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {validationError && (
            <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-800/80 text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{validationError}</span>
            </div>
          )}

          {/* SKU Code & Product Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                SKU Identifier <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. SKU-1002"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono uppercase focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                GTIN / Barcode (UPC/EAN)
              </label>
              <input
                type="text"
                placeholder="e.g. 084012345678"
                value={gtin}
                onChange={(e) => setGtin(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-300 font-semibold block mb-1">
              Product Title &amp; Description <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Premium White Oak Engineered Flooring"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {/* Category / Product Family */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Category / Family</label>
              <input
                type="text"
                placeholder="e.g. Flooring"
                value={productFamily}
                onChange={(e) => setProductFamily(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">Variant / Spec</label>
              <input
                type="text"
                placeholder="e.g. Matte 15mm"
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">Colour</label>
              <input
                type="text"
                placeholder="e.g. Natural"
                value={colour}
                onChange={(e) => setColour(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Packaging Specifications */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
              Packaging &amp; Volume Specifications
            </span>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-slate-400 text-[11px] block mb-1">Expected Cartons</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={expectedCartons}
                  onChange={(e) => setExpectedCartons(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono text-center font-bold"
                />
              </div>

              <div>
                <label className="text-slate-400 text-[11px] block mb-1">Units / Carton</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={unitsPerCarton}
                  onChange={(e) => setUnitsPerCarton(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono text-center font-bold"
                />
              </div>

              <div>
                <label className="text-slate-400 text-[11px] block mb-1">Total Expected Units</label>
                <div className="w-full bg-slate-900/60 border border-cyan-500/30 rounded-lg p-2 text-cyan-300 font-mono text-center font-bold flex items-center justify-center">
                  {totalExpectedUnits}
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-cyan-950"
            >
              <Check className="w-4 h-4" />
              Save SKU Details
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
