import React, { useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Building2,
  PackagePlus,
  FileSpreadsheet,
  Plus,
  Download,
  Upload,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { Supplier, Product, PurchaseOrder } from '../types';
import {
  downloadProductsCsvTemplate,
  downloadPurchaseOrdersCsvTemplate,
  parseProductsCsv,
  parsePurchaseOrdersCsv,
} from '../lib/csvHelper';

interface EmptyStateOnboardingProps {
  suppliers: Supplier[];
  products: Product[];
  purchaseOrders: PurchaseOrder[];
  onAddSupplier: () => void;
  onAddProduct: () => void;
  onCreatePO: () => void;
  onStartInspection: () => void;
  onImportProducts: (products: Partial<Product>[]) => void;
  onImportPurchaseOrders: (orders: Partial<PurchaseOrder>[]) => void;
  onLoadDemoData: () => void;
}

export function EmptyStateOnboarding({
  suppliers,
  products,
  purchaseOrders,
  onAddSupplier,
  onAddProduct,
  onCreatePO,
  onStartInspection,
  onImportProducts,
  onImportPurchaseOrders,
  onLoadDemoData,
}: EmptyStateOnboardingProps) {
  const [importModal, setImportModal] = useState<'PRODUCTS' | 'POS' | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  const hasSuppliers = suppliers.length > 0;
  const hasProducts = products.length > 0;
  const hasPOs = purchaseOrders.length > 0;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'PRODUCTS' | 'POS') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (type === 'PRODUCTS') {
        const { products: parsed, errors } = parseProductsCsv(text);
        if (errors.length > 0) {
          setCsvError(`CSV validation failed: ${errors[0]}`);
          return;
        }
        if (parsed.length === 0) {
          setCsvError('No valid product records found in CSV.');
          return;
        }
        onImportProducts(parsed);
        setImportModal(null);
      } else {
        const { orders: parsed, errors } = parsePurchaseOrdersCsv(text);
        if (errors.length > 0) {
          setCsvError(`CSV validation failed: ${errors[0]}`);
          return;
        }
        if (parsed.length === 0) {
          setCsvError('No valid purchase order records found in CSV.');
          return;
        }
        onImportPurchaseOrders(parsed);
        setImportModal(null);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-6">
      {/* Hero Welcome */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center relative overflow-hidden shadow-xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold mb-4">
          <ShieldCheck className="w-4 h-4" /> Production-Ready Warehouse Receiving
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
          Verify inventory at the moment it arrives.
        </h1>
        <p className="text-slate-400 text-xs md:text-sm max-w-xl mx-auto mt-2 leading-relaxed">
          Welcome to DockProof AI. To maintain strict warehouse compliance and zero mock data,
          please set up your warehouse catalogue and open Purchase Orders below.
        </p>

        {/* Quick Start: Load Demo Data */}
        <div className="mt-6 p-4 bg-cyan-950/30 border border-cyan-500/30 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
          <div>
            <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Quick Start — Demo Dataset
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Load 3 suppliers, 5 products, 3 open POs, and 5 past inspection records instantly for testing.
            </p>
          </div>
          <button
            onClick={onLoadDemoData}
            className="shrink-0 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-5 py-2.5 rounded-lg text-xs transition flex items-center gap-2 shadow-lg shadow-cyan-950 cursor-pointer whitespace-nowrap"
          >
            ⚡ Load Demo Data
          </button>
        </div>

        {/* Setup Progress Tracker */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-4 gap-3 text-left">
          {/* Step 1: Supplier */}
          <div
            className={`p-4 rounded-xl border transition ${
              hasSuppliers
                ? 'bg-slate-950/80 border-emerald-800/60 text-slate-300'
                : 'bg-slate-950/80 border-slate-800 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500">STEP 1</span>
              {hasSuppliers ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <Circle className="w-4 h-4 text-slate-600" />
              )}
            </div>
            <div className="font-semibold text-white text-xs">Add Supplier</div>
            <div className="text-[11px] text-slate-500 mt-1">
              {hasSuppliers ? `${suppliers.length} active supplier(s)` : 'Vendor profiles & contacts'}
            </div>
          </div>

          {/* Step 2: Product Catalogue */}
          <div
            className={`p-4 rounded-xl border transition ${
              hasProducts
                ? 'bg-slate-950/80 border-emerald-800/60 text-slate-300'
                : 'bg-slate-950/80 border-slate-800 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500">STEP 2</span>
              {hasProducts ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <Circle className="w-4 h-4 text-slate-600" />
              )}
            </div>
            <div className="font-semibold text-white text-xs">Product Catalogue</div>
            <div className="text-[11px] text-slate-500 mt-1">
              {hasProducts ? `${products.length} product(s) registered` : 'SKUs, GTIN barcodes & specs'}
            </div>
          </div>

          {/* Step 3: Purchase Orders */}
          <div
            className={`p-4 rounded-xl border transition ${
              hasPOs
                ? 'bg-slate-950/80 border-emerald-800/60 text-slate-300'
                : 'bg-slate-950/80 border-slate-800 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500">STEP 3</span>
              {hasPOs ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <Circle className="w-4 h-4 text-slate-600" />
              )}
            </div>
            <div className="font-semibold text-white text-xs">Purchase Orders</div>
            <div className="text-[11px] text-slate-500 mt-1">
              {hasPOs ? `${purchaseOrders.length} inbound PO(s)` : 'Inbound shipment expectations'}
            </div>
          </div>

          {/* Step 4: First Inspection */}
          <div
            className={`p-4 rounded-xl border transition ${
              hasPOs && hasProducts
                ? 'bg-cyan-950/20 border-cyan-800/60 text-cyan-200'
                : 'bg-slate-950/40 border-slate-800 text-slate-500 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500">STEP 4</span>
              <Circle className="w-4 h-4 text-slate-600" />
            </div>
            <div className="font-semibold text-white text-xs">Start Inspection</div>
            <div className="text-[11px] text-slate-400 mt-1">
              {hasPOs && hasProducts ? 'Ready to receive' : 'Locked until PO is created'}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Suppliers Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center mb-3">
              <Building2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">1. Warehouse Suppliers</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Register suppliers to manage delivery standards, claims, and vendor contacts.
            </p>
          </div>
          <button
            onClick={onAddSupplier}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-2 px-3 rounded-lg text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Supplier
          </button>
        </div>

        {/* Product Catalogue Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-3">
              <PackagePlus className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">2. Product Catalogue</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Define SKUs, GTIN barcodes, units per carton, and standard accessories.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onAddProduct}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-medium py-2 px-2 rounded-lg text-xs transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Manual
            </button>
            <button
              onClick={() => setImportModal('PRODUCTS')}
              className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-2 px-2 rounded-lg text-xs transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Import CSV
            </button>
          </div>
        </div>

        {/* Purchase Orders Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">3. Purchase Orders</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Create expected inbound shipments against which carton barcodes and counts are verified.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCreatePO}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-medium py-2 px-2 rounded-lg text-xs transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Create PO
            </button>
            <button
              onClick={() => setImportModal('POS')}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 px-2 rounded-lg text-xs transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Import CSV
            </button>
          </div>
        </div>
      </div>

      {/* Start Inspection Callout */}
      <div className="bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-900 border border-cyan-800/40 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white">Ready to inspect incoming shipments?</h3>
          <p className="text-xs text-slate-400 mt-1">
            Once at least one Purchase Order and Product exist, operators can scan barcodes and capture photo evidence.
          </p>
        </div>
        <button
          onClick={onStartInspection}
          disabled={!hasPOs || !hasProducts}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-6 py-3 rounded-lg text-xs disabled:opacity-40 transition flex items-center gap-2 cursor-pointer shadow-lg shadow-cyan-950 shrink-0"
        >
          Start Inspection Workflow <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* CSV Import Modal */}
      {importModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                {importModal === 'PRODUCTS' ? 'Import Product Catalogue CSV' : 'Import Purchase Orders CSV'}
              </h3>
              <button
                onClick={() => {
                  setImportModal(null);
                  setCsvError(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Upload your live warehouse CSV. Download the blank template below to ensure proper column headers.
            </p>

            <button
              onClick={() => {
                if (importModal === 'PRODUCTS') {
                  downloadProductsCsvTemplate();
                } else {
                  downloadPurchaseOrdersCsvTemplate();
                }
              }}
              className="w-full bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 font-semibold py-2 px-3 rounded-lg text-xs transition flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Download Blank Template (.CSV)
            </button>

            <div className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center hover:border-cyan-500 transition">
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="text-xs text-slate-200 font-semibold">Select CSV file to import</div>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => handleFileUpload(e, importModal)}
                className="mt-3 text-xs text-slate-400 block w-full file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-500"
              />
            </div>

            {csvError && (
              <div className="bg-rose-950/40 border border-rose-800 p-2.5 rounded text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{csvError}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
