import React, { useState } from 'react';
import { X, FileSpreadsheet, Plus, Trash2, Package, Sparkles, Building2, Check, ArrowRight } from 'lucide-react';
import { PurchaseOrder, Supplier, Product } from '../types';

interface CreatePOModalProps {
  suppliers: Supplier[];
  products: Product[];
  onSave: (po: Omit<PurchaseOrder, 'id' | 'created_at'>) => void;
  onAddProduct?: (product: Omit<Product, 'id' | 'created_at'>) => Product;
  onAddSupplier?: (supplier: Omit<Supplier, 'id' | 'created_at'>) => Supplier;
  onClose: () => void;
}

interface LineItemState {
  id: string;
  entryMode: 'CATALOGUE' | 'MANUAL';
  sku: string;
  product_name: string;
  gtin: string;
  expected_cartons: number;
  expected_units_per_carton: number;
  variant: string;
  colour: string;
  saveToCatalogue: boolean;
}

export function CreatePOModal({
  suppliers,
  products,
  onSave,
  onAddProduct,
  onAddSupplier,
  onClose,
}: CreatePOModalProps) {
  const [poNumber, setPoNumber] = useState(`PO-${Date.now().toString().slice(-5)}`);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || 'manual');
  const [manualSupplierName, setManualSupplierName] = useState('Primary Logistics Supplier');
  const [arrivalDate, setArrivalDate] = useState(new Date().toISOString().split('T')[0]);

  // Initial line setup: if products exist, use first product; else manual entry mode
  const initialMode: 'CATALOGUE' | 'MANUAL' = products.length > 0 ? 'CATALOGUE' : 'MANUAL';
  const firstProd = products[0];

  const [lines, setLines] = useState<LineItemState[]>([
    {
      id: crypto.randomUUID(),
      entryMode: initialMode,
      sku: firstProd?.sku || '',
      product_name: firstProd?.product_name || '',
      gtin: firstProd?.gtin || '',
      expected_cartons: 2,
      expected_units_per_carton: firstProd?.expected_units_per_carton || 12,
      variant: firstProd?.variant || 'Standard',
      colour: firstProd?.colour || '',
      saveToCatalogue: true,
    },
  ]);

  const handleAddLine = () => {
    const defaultMode: 'CATALOGUE' | 'MANUAL' = products.length > 0 ? 'CATALOGUE' : 'MANUAL';
    const prod = products[0];
    setLines([
      ...lines,
      {
        id: crypto.randomUUID(),
        entryMode: defaultMode,
        sku: prod?.sku || '',
        product_name: prod?.product_name || '',
        gtin: prod?.gtin || '',
        expected_cartons: 1,
        expected_units_per_carton: prod?.expected_units_per_carton || 12,
        variant: prod?.variant || 'Standard',
        colour: prod?.colour || '',
        saveToCatalogue: true,
      },
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    if (lines.length > 1) {
      setLines(lines.filter((_, i) => i !== idx));
    }
  };

  const handleCatalogueSelect = (idx: number, selectedSku: string) => {
    const matched = products.find((p) => p.sku === selectedSku);
    const updated = [...lines];
    updated[idx] = {
      ...updated[idx],
      sku: selectedSku,
      product_name: matched?.product_name || selectedSku,
      gtin: matched?.gtin || '',
      expected_units_per_carton: matched?.expected_units_per_carton || updated[idx].expected_units_per_carton || 12,
      variant: matched?.variant || 'Standard',
      colour: matched?.colour || '',
    };
    setLines(updated);
  };

  const toggleLineMode = (idx: number) => {
    const updated = [...lines];
    const current = updated[idx];
    const newMode: 'CATALOGUE' | 'MANUAL' = current.entryMode === 'CATALOGUE' ? 'MANUAL' : 'CATALOGUE';
    updated[idx] = {
      ...current,
      entryMode: newMode,
    };
    setLines(updated);
  };

  const updateLineField = (idx: number, field: keyof LineItemState, value: any) => {
    const updated = [...lines];
    updated[idx] = {
      ...updated[idx],
      [field]: value,
    };
    setLines(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!poNumber.trim() || lines.length === 0) return;

    // Validate that every line has at least an SKU
    const validLines = lines.filter((l) => l.sku.trim().length > 0);
    if (validLines.length === 0) {
      alert('Please enter at least one valid Product SKU.');
      return;
    }

    // Resolve or create supplier
    let effectiveSupplierId = supplierId;
    let effectiveSupplierName = 'Primary Supplier';

    if (supplierId === 'manual' || !supplierId) {
      const supName = manualSupplierName.trim() || 'Inbound Supplier';
      if (onAddSupplier) {
        const newSup = onAddSupplier({
          supplier_code: `SUP-${Date.now().toString().slice(-4)}`,
          supplier_name: supName,
          active: true,
        });
        effectiveSupplierId = newSup.id;
        effectiveSupplierName = newSup.supplier_name;
      } else {
        effectiveSupplierId = crypto.randomUUID();
        effectiveSupplierName = supName;
      }
    } else {
      const matchedSup = suppliers.find((s) => s.id === supplierId);
      if (matchedSup) {
        effectiveSupplierId = matchedSup.id;
        effectiveSupplierName = matchedSup.supplier_name;
      }
    }

    // Auto-save any manual SKUs to product catalogue if requested or not yet present
    validLines.forEach((l) => {
      const skuUpper = l.sku.trim().toUpperCase();
      const existingProduct = products.find((p) => p.sku.toUpperCase() === skuUpper);

      if (!existingProduct && l.saveToCatalogue && onAddProduct) {
        onAddProduct({
          sku: skuUpper,
          product_name: l.product_name.trim() || skuUpper,
          gtin: l.gtin.trim() || `${Date.now().toString().slice(-12)}`,
          expected_units_per_carton: Math.max(1, Number(l.expected_units_per_carton)),
          variant: l.variant || 'Standard',
          colour: l.colour || 'N/A',
          supplier_id: effectiveSupplierId,
          active: true,
        });
      }
    });

    const poLines = validLines.map((l) => {
      const skuUpper = l.sku.trim().toUpperCase();
      const matchedProd = products.find((prod) => prod.sku.toUpperCase() === skuUpper);
      const cartons = Math.max(1, Number(l.expected_cartons));
      const unitsPerBox = Math.max(1, Number(l.expected_units_per_carton));

      return {
        id: crypto.randomUUID(),
        purchase_order_id: 'pending',
        sku: skuUpper,
        product_name: l.product_name.trim() || matchedProd?.product_name || skuUpper,
        gtin: l.gtin.trim() || matchedProd?.gtin || '',
        expected_units: cartons * unitsPerBox,
        expected_cartons: cartons,
        expected_units_per_carton: unitsPerBox,
        expected_variant: l.variant || matchedProd?.variant || 'Standard',
        expected_colour: l.colour || matchedProd?.colour || 'N/A',
        required_components: matchedProd?.required_components,
      };
    });

    onSave({
      po_number: poNumber.trim().toUpperCase(),
      supplier_id: effectiveSupplierId,
      supplier_name: effectiveSupplierName,
      expected_arrival_date: arrivalDate,
      status: 'OPEN',
      lines: poLines,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto shadow-2xl font-sans text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Create Purchase Order</h3>
              <p className="text-[11px] text-slate-400">Define inbound order and expected product lines</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Top Order Information */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  PO Number <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="e.g. PO-9001"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono uppercase focus:outline-none focus:border-cyan-500 text-xs"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Expected Delivery Date</label>
                <input
                  type="date"
                  value={arrivalDate}
                  onChange={(e) => setArrivalDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500 text-xs"
                />
              </div>
            </div>

            {/* Supplier Selection or Manual Supplier */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Supplier</label>
              {suppliers.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white text-xs focus:outline-none focus:border-cyan-500"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.supplier_name} ({s.supplier_code})
                      </option>
                    ))}
                    <option value="manual">+ Enter Custom Supplier</option>
                  </select>

                  {supplierId === 'manual' && (
                    <input
                      type="text"
                      value={manualSupplierName}
                      onChange={(e) => setManualSupplierName(e.target.value)}
                      placeholder="Supplier Name"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white text-xs focus:outline-none focus:border-cyan-500"
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <input
                    type="text"
                    value={manualSupplierName}
                    onChange={(e) => setManualSupplierName(e.target.value)}
                    placeholder="e.g. Acme Logistics Supplier"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white text-xs focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-[10px] text-slate-500">
                    No suppliers saved yet. Name will be automatically registered.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Line items section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-slate-200 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-cyan-400" />
                  PO Expected Product Lines ({lines.length})
                </label>
                <span className="text-[10px] text-slate-400">
                  Select from existing catalogue or type SKU details manually.
                </span>
              </div>

              <button
                type="button"
                onClick={handleAddLine}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 transition cursor-pointer border border-slate-700"
              >
                <Plus className="w-3.5 h-3.5" /> Add Another Line
              </button>
            </div>

            {/* Line Cards List */}
            <div className="space-y-3">
              {lines.map((line, idx) => {
                const isCatalogueMode = line.entryMode === 'CATALOGUE' && products.length > 0;

                return (
                  <div
                    key={line.id}
                    className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 relative group"
                  >
                    {/* Line Header */}
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          Line #{idx + 1}
                        </span>

                        {/* Mode Toggle Button: Select vs Type */}
                        {products.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleLineMode(idx)}
                            className="text-[10px] px-2 py-0.5 rounded font-medium text-cyan-400 hover:text-cyan-300 bg-cyan-950/40 border border-cyan-800/50 transition cursor-pointer"
                          >
                            {isCatalogueMode ? 'Switch to Manual SKU Entry' : 'Select from Catalogue'}
                          </button>
                        )}
                      </div>

                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="text-slate-500 hover:text-rose-400 p-1 transition cursor-pointer"
                          title="Remove Line"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Mode 1: Select Existing Catalogue SKU */}
                    {isCatalogueMode ? (
                      <div className="space-y-2">
                        <div>
                          <label className="text-[11px] text-slate-400 block mb-1">
                            Product SKU from Catalogue <span className="text-rose-400">*</span>
                          </label>
                          <select
                            value={line.sku}
                            onChange={(e) => handleCatalogueSelect(idx, e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.sku}>
                                {p.sku} &bull; {p.product_name} (GTIN: {p.gtin || 'N/A'})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Auto-filled Preview */}
                        <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-300 gap-2">
                          <div>
                            <span className="text-slate-500">Name:</span>{' '}
                            <strong className="text-white">{line.product_name || 'Item'}</strong>
                          </div>
                          {line.gtin && (
                            <div>
                              <span className="text-slate-500">GTIN:</span>{' '}
                              <span className="font-mono text-cyan-400">{line.gtin}</span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleLineMode(idx)}
                            className="text-xs text-cyan-400 hover:underline font-medium ml-auto"
                          >
                            Edit details manually &rarr;
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Mode 2: Manual SKU Details Entry */
                      <div className="space-y-3">
                        {products.length === 0 && (
                          <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-800/40 text-[11px] text-cyan-300 flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
                            <span>
                              Enter product SKU details below. It will automatically be linked to this Purchase Order.
                            </span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          {/* SKU Input */}
                          <div>
                            <label className="text-[11px] text-slate-300 font-semibold block mb-1">
                              Product SKU <span className="text-rose-400">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={line.sku}
                              onChange={(e) => updateLineField(idx, 'sku', e.target.value.toUpperCase())}
                              placeholder="e.g. SKU-1001"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono font-bold uppercase focus:outline-none focus:border-cyan-500 text-xs"
                            />
                          </div>

                          {/* Product Name Input */}
                          <div className="sm:col-span-2">
                            <label className="text-[11px] text-slate-300 font-semibold block mb-1">
                              Product Name / Description
                            </label>
                            <input
                              type="text"
                              value={line.product_name}
                              onChange={(e) => updateLineField(idx, 'product_name', e.target.value)}
                              placeholder="e.g. Stainless Steel Water Bottle 750ml"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500 text-xs"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          {/* GTIN / Barcode Input */}
                          <div>
                            <label className="text-[11px] text-slate-300 font-semibold block mb-1">
                              GTIN / Barcode
                            </label>
                            <input
                              type="text"
                              value={line.gtin}
                              onChange={(e) => updateLineField(idx, 'gtin', e.target.value.trim())}
                              placeholder="e.g. 08901234567890"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono focus:outline-none focus:border-cyan-500 text-xs"
                            />
                          </div>

                          {/* Variant Input */}
                          <div>
                            <label className="text-[11px] text-slate-300 font-semibold block mb-1">
                              Variant
                            </label>
                            <input
                              type="text"
                              value={line.variant}
                              onChange={(e) => updateLineField(idx, 'variant', e.target.value)}
                              placeholder="e.g. Standard, 750ml"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500 text-xs"
                            />
                          </div>

                          {/* Colour Input */}
                          <div>
                            <label className="text-[11px] text-slate-300 font-semibold block mb-1">
                              Colour
                            </label>
                            <input
                              type="text"
                              value={line.colour}
                              onChange={(e) => updateLineField(idx, 'colour', e.target.value)}
                              placeholder="e.g. Matte Black"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500 text-xs"
                            />
                          </div>
                        </div>

                        {/* Save to Catalogue Checkbox */}
                        <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300 pt-1">
                          <input
                            type="checkbox"
                            checked={line.saveToCatalogue}
                            onChange={(e) => updateLineField(idx, 'saveToCatalogue', e.target.checked)}
                            className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 w-3.5 h-3.5"
                          />
                          <span>Save this SKU and details to Product Catalogue for future scanning</span>
                        </label>
                      </div>
                    )}

                    {/* Quantity & Units Configuration */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-800/80">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">
                          Expected Cartons <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={line.expected_cartons}
                          onChange={(e) => updateLineField(idx, 'expected_cartons', Math.max(1, Number(e.target.value)))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono font-bold text-center text-xs focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">
                          Units / Carton <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={line.expected_units_per_carton}
                          onChange={(e) => updateLineField(idx, 'expected_units_per_carton', Math.max(1, Number(e.target.value)))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono font-bold text-center text-xs focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      <div className="col-span-2 sm:col-span-1 bg-slate-900/80 rounded-lg p-2 flex flex-col justify-center items-center sm:items-end border border-slate-800">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">Total Expected</span>
                        <span className="text-emerald-400 font-mono font-bold text-sm">
                          {Math.max(1, line.expected_cartons) * Math.max(1, line.expected_units_per_carton)} units
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <span className="text-[11px] text-slate-500 font-mono">
              Total lines: {lines.length} &bull; Total units:{' '}
              {lines.reduce((acc, l) => acc + (Math.max(1, l.expected_cartons) * Math.max(1, l.expected_units_per_carton)), 0)}
            </span>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-xs font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2 rounded-xl text-xs transition cursor-pointer shadow-lg shadow-emerald-950 flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" /> Save Purchase Order
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
