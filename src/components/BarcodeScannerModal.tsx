import React from 'react';
import { X, Camera } from 'lucide-react';
import { BarcodeScan, Product, PurchaseOrderLine } from '../types';
import { BarcodeScanner } from './BarcodeScanner';

interface BarcodeScannerModalProps {
  expectedSku: string;
  expectedGtin: string;
  poNumber?: string;
  products: Product[];
  onScanComplete: (scan: BarcodeScan) => void;
  onClose: () => void;
  onRequestManagerReview?: () => void;
  onLogException?: (reason: string) => void;
}

export function BarcodeScannerModal({
  expectedSku,
  expectedGtin,
  poNumber = 'PO-ACTIVE',
  products,
  onScanComplete,
  onClose,
  onRequestManagerReview,
  onLogException,
}: BarcodeScannerModalProps) {
  const dummyLine: PurchaseOrderLine = {
    id: 'active-po-line',
    purchase_order_id: 'active-po',
    sku: expectedSku,
    product_name: expectedSku,
    gtin: expectedGtin,
    expected_units: 1,
    expected_cartons: 1,
    expected_units_per_carton: 1,
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative">
        {/* Close Button Header */}
        <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2 text-white font-bold text-xs">
            <Camera className="w-4 h-4 text-cyan-400" />
            <span>Real-Time Carton Barcode Scanner</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Embedded BarcodeScanner Component */}
        <div className="p-3 sm:p-4">
          <BarcodeScanner
            expectedLine={dummyLine}
            poNumber={poNumber}
            products={products}
            onScanComplete={(scan) => {
              onScanComplete(scan);
              onClose();
            }}
            onCancel={onClose}
            onRequestManagerReview={onRequestManagerReview}
            onLogException={onLogException}
          />
        </div>
      </div>
    </div>
  );
}
