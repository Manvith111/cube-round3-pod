/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useAppStore } from './lib/store';
import { useTheme } from './lib/theme';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { EmptyStateOnboarding } from './components/EmptyStateOnboarding';
import { NewInspectionWizard } from './components/NewInspectionWizard';
import { InspectionResultView } from './components/InspectionResultView';
import { InspectionReportView } from './components/InspectionReportView';
import { InspectionScanPage } from './pages/InspectionScanPage';
import { ExceptionsQueue } from './components/ExceptionsQueue';
import { PurchaseOrdersView } from './components/PurchaseOrdersView';
import { ProductsView } from './components/ProductsView';
import { SuppliersView } from './components/SuppliersView';
import { AnalyticsView } from './components/AnalyticsView';
import { LaunchReadinessView } from './components/LaunchReadinessView';
import { AuditLedgerView } from './components/AuditLedgerView';
import { AddSupplierModal } from './components/AddSupplierModal';
import { AddProductModal } from './components/AddProductModal';
import { CreatePOModal } from './components/CreatePOModal';
import { LoginPage } from './components/LoginPage';
import { Inspection, PurchaseOrder, PurchaseOrderLine, BarcodeScan } from './types';
import { parsePurchaseOrdersCsv, parseProductsCsv } from './lib/csvHelper';
import {
  ScanLine,
  Scan,
  FileSpreadsheet,
  Package,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

export default function App() {
  const store = useAppStore();

  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [activeInspection, setActiveInspection] = useState<Inspection | null>(null);

  // Scan Route state: /inspections/[inspectionId]/scan
  const [scanInspectionId, setScanInspectionId] = useState<string>('');
  const [scanPoId, setScanPoId] = useState<string>('');
  const [scanLineSku, setScanLineSku] = useState<string>('');

  // Modals state
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showCreatePOModal, setShowCreatePOModal] = useState(false);

  // Listen to browser URL for /inspections/[inspectionId]/scan
  useEffect(() => {
    const handleUrlChange = () => {
      const path = window.location.pathname;
      const match = path.match(/\/inspections\/([^/]+)\/scan/);
      if (match) {
        setScanInspectionId(match[1]);
        setCurrentTab('scan');
      }
    };
    handleUrlChange();
    window.addEventListener('popstate', handleUrlChange);
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, []);

  const isDatabaseEmpty = store.suppliers.length === 0 && store.products.length === 0 && store.purchaseOrders.length === 0;

  const handleInspectionFinished = (inspection: Inspection) => {
    store.addInspection(inspection);
    setActiveInspection(inspection);
    setCurrentTab('result');
  };

  const handleManagerOverride = (newStatus: Inspection['status'], reason: string) => {
    if (!activeInspection) return;
    store.overrideInspection(activeInspection.id, newStatus, reason, store.role === 'RECEIVING_MANAGER' ? 'Receiving Manager' : 'Authorized Manager');
    setActiveInspection({
      ...activeInspection,
      status: newStatus,
      action_recommendation: `[Manager Override]: ${reason}`,
    });
  };

  const handleQuarantine = () => {
    if (!activeInspection) return;
    store.overrideInspection(activeInspection.id, 'EXCEPTION', 'Quarantined carton by receiving dock personnel', 'Dock Manager');
    setActiveInspection({
      ...activeInspection,
      status: 'EXCEPTION',
      action_recommendation: 'Quarantine affected carton(s), preserve evidence, and initiate supplier review.',
    });
  };

  // Show login page if not authenticated
  if (!store.isAuthenticated) {
    return <LoginPage onLogin={store.login} />;
  }

  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ background: 'var(--bg)', color: 'var(--on-surface)' }}>
      {/* Top Navbar */}
      <Navbar
        userRole={store.role}
        userName={store.userName}
        onRoleChange={store.setRole}
        mode={store.mode}
        onModeChange={store.setMode}
        onLogout={store.logout}
        isDark={isDark}
        onToggleTheme={toggleTheme}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <Sidebar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          userRole={store.role}
          userName={store.userName}
          onLogout={store.logout}
          exceptionCount={store.exceptions.filter((e) => e.status === 'OPEN').length}
          openPoCount={store.purchaseOrders.filter((p) => p.status === 'OPEN').length}
        />

        {/* Main Workspace Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-slate-950 pb-24 md:pb-8">
          <div className="max-w-6xl mx-auto">

            {/* TAB: DASHBOARD */}
            {currentTab === 'dashboard' && (
              isDatabaseEmpty ? (
                <EmptyStateOnboarding
                  suppliers={store.suppliers}
                  products={store.products}
                  purchaseOrders={store.purchaseOrders}
                  onAddSupplier={() => setShowAddSupplierModal(true)}
                  onAddProduct={() => setShowAddProductModal(true)}
                  onCreatePO={() => setShowCreatePOModal(true)}
                  onStartInspection={() => setCurrentTab('inspection')}
                  onImportProducts={(prods) => store.importProducts(prods)}
                  onImportPurchaseOrders={(pos) => store.importPurchaseOrders(pos)}
                  onLoadDemoData={store.loadDemoData}
                />
              ) : (
                /* Populated Dashboard */
                <div className="space-y-6">
                  {/* Top Stats Banner */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
                    <div>
                      <h1 className="text-xl font-bold text-white tracking-tight">Receiving Dock Overview</h1>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Operating in <strong className="text-amber-400">{store.mode} MODE</strong> &bull; Role: {store.role}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          if (window.confirm('Reset all data and reload the demo dataset?')) {
                            store.clearAllData();
                            store.loadDemoData();
                          }
                        }}
                        className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-cyan-300 font-semibold px-3 py-2 rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
                        title="Reset to demo dataset"
                      >
                        ⚡ Demo Data
                      </button>
                      <button
                        onClick={() => setCurrentTab('inspection')}
                        className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-5 py-2.5 rounded-lg text-xs transition flex items-center gap-2 shadow-lg shadow-cyan-950 cursor-pointer"
                      >
                        <ScanLine className="w-4 h-4" /> Start Inbound Inspection
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div
                      onClick={() => setCurrentTab('purchase-orders')}
                      className="bg-slate-900 border border-slate-800 p-4 rounded-xl hover:border-slate-700 transition cursor-pointer"
                    >
                      <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> Open POs
                      </span>
                      <div className="text-2xl font-bold text-white mt-1">
                        {store.purchaseOrders.filter((p) => p.status === 'OPEN').length}
                      </div>
                      <span className="text-[10px] text-slate-500">{store.purchaseOrders.length} total orders</span>
                    </div>

                    <div
                      onClick={() => setCurrentTab('products')}
                      className="bg-slate-900 border border-slate-800 p-4 rounded-xl hover:border-slate-700 transition cursor-pointer"
                    >
                      <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-cyan-400" /> Active SKUs
                      </span>
                      <div className="text-2xl font-bold text-white mt-1">{store.products.length}</div>
                      <span className="text-[10px] text-slate-500">In product catalogue</span>
                    </div>

                    <div
                      onClick={() => setCurrentTab('exceptions')}
                      className="bg-slate-900 border border-slate-800 p-4 rounded-xl hover:border-slate-700 transition cursor-pointer"
                    >
                      <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Open Exceptions
                      </span>
                      <div className="text-2xl font-bold text-rose-400 mt-1">
                        {store.exceptions.filter((e) => e.status === 'OPEN').length}
                      </div>
                      <span className="text-[10px] text-slate-500">Require manager review</span>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                      <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Total Received
                      </span>
                      <div className="text-2xl font-bold text-emerald-400 mt-1">
                        {store.inspections.length}
                      </div>
                      <span className="text-[10px] text-slate-500">Shipments inspected</span>
                    </div>
                  </div>

                  {/* Active Inbound Purchase Orders Queue */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold text-white flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                        Inbound Purchase Orders Awaiting Receipt
                      </h2>
                      <button
                        onClick={() => setCurrentTab('purchase-orders')}
                        className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
                      >
                        View All ({store.purchaseOrders.length}) &rarr;
                      </button>
                    </div>

                    <div className="divide-y divide-slate-800 text-xs">
                      {store.purchaseOrders.slice(0, 5).map((po) => (
                        <div
                          key={po.id}
                          className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-white">{po.po_number}</span>
                              <span className="text-[10px] font-bold px-2 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                                {po.status}
                              </span>
                            </div>
                            <div className="text-slate-400 text-xs mt-0.5">
                              Supplier: {po.supplier_name} &bull; {po.lines.length} Line(s)
                            </div>
                          </div>

                          <button
                            onClick={() => setCurrentTab('inspection')}
                            className="bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold px-3 py-1.5 rounded-lg transition self-start sm:self-center flex items-center gap-1"
                          >
                            Inspect Shipment &rarr;
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent Inspections History */}
                  {store.inspections.length > 0 && (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-white flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                          Recent Completed Inspections
                        </h2>
                      </div>

                      <div className="divide-y divide-slate-800 text-xs">
                        {store.inspections.slice(0, 5).map((insp) => (
                          <div
                            key={insp.id}
                            onClick={() => {
                              setActiveInspection(insp);
                              setCurrentTab('result');
                            }}
                            className="py-3 flex items-center justify-between gap-3 hover:bg-slate-800/30 p-2 rounded transition cursor-pointer"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-white">{insp.po_number}</span>
                                <span className="text-cyan-400 font-mono text-[11px]">{insp.product_sku}</span>
                              </div>
                              <div className="text-slate-400 text-xs mt-0.5">
                                {insp.product_name} &bull; {new Date(insp.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>

                            <span
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                                insp.status === 'ACCEPT'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : insp.status === 'EXCEPTION'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {insp.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    )}

                  {/* Barcode Testing Guide */}
                  <div className="bg-slate-900 border border-cyan-800/30 rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold text-white flex items-center gap-2">
                        <Scan className="w-4 h-4 text-cyan-400" />
                        Barcode Testing Guide
                      </h2>
                      <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                        Use "Manual Entry" in barcode scanner
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      During inspection, open the barcode scanner and tap <strong className="text-slate-300">Manual Entry</strong> to type any GTIN below. It will match the corresponding demo product.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs font-mono">
                      {[
                        { sku: 'SKU-WB750', gtin: '08901234567890', name: 'Water Bottle 750ml',     po: 'PO-2026-0041' },
                        { sku: 'SKU-EH100', gtin: '07612345678905', name: 'Ergonomic Headset',       po: 'PO-2026-0041' },
                        { sku: 'SKU-HC400', gtin: '08907654321098', name: 'ProSport Hiking Cap',     po: 'PO-2026-0042' },
                        { sku: 'SKU-MS300', gtin: '04006381333931', name: 'Floor Scale 300kg',       po: 'PO-2026-0039' },
                        { sku: 'SKU-TP200', gtin: '05012345678901', name: 'Thermal Pad 200x200cm',  po: 'PO-2026-0039' },
                      ].map((item) => (
                        <div
                          key={item.sku}
                          className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-cyan-400 font-bold text-[11px]">{item.sku}</span>
                            <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{item.po}</span>
                          </div>
                          <div className="text-white tracking-widest text-[12px]">{item.gtin}</div>
                          <div className="text-slate-500 text-[10px] font-sans truncate">{item.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            )}

            {/* TAB: INSPECTION WIZARD */}
            {currentTab === 'inspection' && (
              store.purchaseOrders.length === 0 || store.products.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3 max-w-lg mx-auto my-12">
                  <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
                  <h3 className="text-base font-bold text-white">Cannot Start Inspection Yet</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    To prevent phantom or mock inspections, you must have at least one active Purchase Order and Product in your catalogue.
                  </p>
                  <button
                    onClick={() => setCurrentTab('dashboard')}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-4 py-2 rounded-lg text-xs transition"
                  >
                    Go to Setup Checklist &rarr;
                  </button>
                </div>
              ) : (
                <NewInspectionWizard
                  purchaseOrders={store.purchaseOrders.filter((p) => p.status === 'OPEN')}
                  products={store.products}
                  onInspectionFinished={handleInspectionFinished}
                  onCancel={() => setCurrentTab('dashboard')}
                />
              )
            )}

            {/* TAB: INSPECTION RESULT */}
            {currentTab === 'result' && activeInspection && (
              <InspectionReportView
                inspection={activeInspection}
                userRole={store.role}
                onBack={() => setCurrentTab('dashboard')}
                onRetake={() => setCurrentTab('inspection')}
                onRequestManagerReview={() => {
                  alert('Manager review requested. Notification logged in audit ledger.');
                  store.logAudit('MANAGER_REVIEW_REQUESTED', 'inspection', activeInspection.id);
                }}
                onManagerOverride={handleManagerOverride}
                onQuarantine={handleQuarantine}
              />
            )}

            {/* TAB: PURCHASE ORDERS */}
            {currentTab === 'purchase-orders' && (
              <PurchaseOrdersView
                purchaseOrders={store.purchaseOrders}
                onCreatePO={() => setShowCreatePOModal(true)}
                onImportCsv={() => {
                  // Prompt file upload directly
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.csv';
                  input.onchange = (e: any) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const text = reader.result as string;
                      const { orders } = parsePurchaseOrdersCsv(text);
                      if (orders.length > 0) store.importPurchaseOrders(orders);
                    };
                    reader.readAsText(file);
                  };
                  input.click();
                }}
              />
            )}

            {/* TAB: REAL-TIME BARCODE SCANNER (/inspections/[inspectionId]/scan) */}
            {currentTab === 'scan' && (
              (() => {
                const targetPo = store.purchaseOrders.find((p) => p.id === scanPoId) || store.purchaseOrders[0];
                const targetLine = targetPo?.lines.find((l) => (scanLineSku ? l.sku === scanLineSku : true)) || targetPo?.lines[0];

                if (!targetPo || !targetLine) {
                  return (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3 max-w-lg mx-auto my-12">
                      <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
                      <h3 className="text-base font-bold text-white">No Active Purchase Order Line</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        To run the real-time carton barcode scanner, select an inbound Purchase Order and product line first.
                      </p>
                      <button
                        onClick={() => setCurrentTab('purchase-orders')}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-4 py-2 rounded-lg text-xs transition"
                      >
                        View Purchase Orders &rarr;
                      </button>
                    </div>
                  );
                }

                return (
                  <InspectionScanPage
                    inspectionId={scanInspectionId || activeInspection?.id || crypto.randomUUID()}
                    po={targetPo}
                    line={targetLine}
                    products={store.products}
                    onScanSaved={(scan) => {
                      store.logAudit('BARCODE_SCANNED', 'inspection', scanInspectionId || 'new', {
                        barcode: scan.barcode_value,
                        status: scan.match_status,
                        format: scan.barcode_format,
                      });
                    }}
                    onContinueToPhotos={() => {
                      setCurrentTab('inspection');
                    }}
                    onBack={() => {
                      try {
                        window.history.pushState(null, '', '/');
                      } catch {}
                      setCurrentTab('dashboard');
                    }}
                    onRequestManagerReview={() => {
                      alert('Manager review requested for uncatalogued barcode. Recorded in audit ledger.');
                      store.logAudit('MANAGER_REVIEW_REQUESTED', 'barcode', scanInspectionId || 'new');
                    }}
                    onLogException={(reason) => {
                      store.addException({
                        inspection_id: scanInspectionId || crypto.randomUUID(),
                        purchase_order_id: targetPo.id,
                        po_number: targetPo.po_number,
                        product_sku: targetLine.sku,
                        severity: 'HIGH',
                        issue_type: 'WRONG_SKU',
                        notes: reason,
                      });
                      alert('Discrepancy logged to exceptions queue.');
                    }}
                  />
                );
              })()
            )}

            {/* TAB: EXCEPTIONS QUEUE */}
            {currentTab === 'exceptions' && (
              <ExceptionsQueue
                exceptions={store.exceptions}
                onUpdateStatus={store.updateException}
              />
            )}

            {/* TAB: PRODUCT CATALOGUE */}
            {currentTab === 'products' && (
              <ProductsView
                products={store.products}
                suppliers={store.suppliers}
                onAddProduct={() => setShowAddProductModal(true)}
                onImportCsv={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.csv';
                  input.onchange = (e: any) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const text = reader.result as string;
                      const { products } = parseProductsCsv(text);
                      if (products.length > 0) store.importProducts(products);
                    };
                    reader.readAsText(file);
                  };
                  input.click();
                }}
              />
            )}

            {/* TAB: SUPPLIERS */}
            {currentTab === 'suppliers' && (
              <SuppliersView
                suppliers={store.suppliers}
                onAddSupplier={() => setShowAddSupplierModal(true)}
              />
            )}

            {/* TAB: ANALYTICS */}
            {currentTab === 'analytics' && (
              <AnalyticsView
                inspections={store.inspections}
                exceptions={store.exceptions}
                suppliers={store.suppliers}
              />
            )}

            {/* TAB: AUDIT LEDGER */}
            {currentTab === 'audit-logs' && (
              <AuditLedgerView logs={store.auditLogs} />
            )}

            {/* TAB: LAUNCH READINESS */}
            {currentTab === 'readiness' && (
              <LaunchReadinessView
                products={store.products}
                purchaseOrders={store.purchaseOrders}
                suppliers={store.suppliers}
                inspections={store.inspections}
              />
            )}

          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        exceptionCount={store.exceptions.filter((e) => e.status === 'OPEN').length}
        onLogout={store.logout}
      />

      {/* Global Modals */}
      {showAddSupplierModal && (
        <AddSupplierModal
          onSave={store.addSupplier}
          onClose={() => setShowAddSupplierModal(false)}
        />
      )}

      {showAddProductModal && (
        <AddProductModal
          suppliers={store.suppliers}
          onSave={store.addProduct}
          onClose={() => setShowAddProductModal(false)}
        />
      )}

      {showCreatePOModal && (
        <CreatePOModal
          suppliers={store.suppliers}
          products={store.products}
          onSave={store.createPurchaseOrder}
          onAddProduct={store.addProduct}
          onAddSupplier={store.addSupplier}
          onClose={() => setShowCreatePOModal(false)}
        />
      )}
    </div>
  );
}
