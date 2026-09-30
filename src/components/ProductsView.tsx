import React, { useState } from 'react';
import { Package, Plus, FileSpreadsheet, Search, Download } from 'lucide-react';
import { Product, Supplier } from '../types';
import { downloadProductsCsvTemplate } from '../lib/csvHelper';

interface ProductsViewProps {
  products: Product[];
  suppliers: Supplier[];
  onAddProduct: () => void;
  onImportCsv: () => void;
}

export function ProductsView({ products, suppliers, onAddProduct, onImportCsv }: ProductsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = products.filter(
    (p) =>
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.gtin.includes(searchTerm)
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-cyan-400" />
            Product Catalogue
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Registered master SKU data, GTIN barcodes, and packaging specifications.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={downloadProductsCsvTemplate}
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
            onClick={onAddProduct}
            className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition shadow-lg shadow-cyan-950"
          >
            <Plus className="w-3.5 h-3.5" /> Add Product
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search by SKU, product name, or GTIN barcode..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Products Table */}
      {filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400 text-xs">
          {products.length === 0
            ? 'No products in catalogue yet. Click "Add Product" or "Import CSV" to get started.'
            : 'No matching products found.'}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4">GTIN / Barcode</th>
                  <th className="py-3 px-4">Variant</th>
                  <th className="py-3 px-4">Units / Carton</th>
                  <th className="py-3 px-4">Components</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono">
                {filtered.map((prod) => (
                  <tr key={prod.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4 font-bold text-cyan-300">{prod.sku}</td>
                    <td className="py-3 px-4 text-slate-200 font-sans">{prod.product_name}</td>
                    <td className="py-3 px-4 text-slate-400">{prod.gtin}</td>
                    <td className="py-3 px-4 text-slate-300 font-sans">{prod.variant || 'Standard'}</td>
                    <td className="py-3 px-4 text-white font-bold">{prod.expected_units_per_carton}</td>
                    <td className="py-3 px-4 text-slate-400 font-sans">
                      {prod.required_components ? prod.required_components.join(', ') : 'All Standard'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
