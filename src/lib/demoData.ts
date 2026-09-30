/**
 * DockProof AI — Demo Seed Data
 *
 * Realistic warehouse receiving test data with valid-format GTINs,
 * supplier profiles, purchase orders, and completed inspection records.
 *
 * BARCODE TESTING GUIDE
 * ─────────────────────
 * Each product has a GTIN that can be entered manually in the barcode
 * scanner to simulate a real scan. Use "Manual Entry" mode in the scanner.
 *
 * Product GTINs for manual barcode entry:
 *   SKU-WB750   → 08901234567890   (Water Bottle 750ml)
 *   SKU-HC400   → 08907654321098   (Hiking Cap)
 *   SKU-TP200   → 05012345678901   (Thermal Pad 200x200)
 *   SKU-EH100   → 07612345678905   (Ergonomic Headset)
 *   SKU-MS300   → 04006381333931   (Mechanical Scale 300kg)
 */

import { Supplier, Product, PurchaseOrder, Inspection, ExceptionItem } from '../types';

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────

export const DEMO_SUPPLIERS: Omit<Supplier, 'id' | 'created_at'>[] = [
  {
    supplier_code: 'SUP-001',
    supplier_name: 'TechGear Manufacturing Co.',
    contact_name: 'Raj Patel',
    email: 'raj.patel@techgear.com',
    phone: '+91-98765-43210',
    address: '14 Industrial Estate, Pune, Maharashtra 411001',
    preferred_claim_process: 'Email photographic evidence within 48h of receipt. RMA form required.',
    active: true,
  },
  {
    supplier_code: 'SUP-002',
    supplier_name: 'ProSport Exports Ltd.',
    contact_name: 'Anita Sharma',
    email: 'anita.sharma@prosport.com',
    phone: '+91-87654-32109',
    address: '7 Export Zone, Ludhiana, Punjab 141001',
    preferred_claim_process: 'Raise supplier claim via portal within 72h. Include carton photos.',
    active: true,
  },
  {
    supplier_code: 'SUP-003',
    supplier_name: 'Global Warehouse Solutions',
    contact_name: 'Chen Wei',
    email: 'chen.wei@gwsolutions.com',
    phone: '+86-21-5555-1234',
    address: '88 Logistics Park, Shenzhen, Guangdong 518000, China',
    preferred_claim_process: 'Submit claim via email with full inspection report within 5 business days.',
    active: true,
  },
];

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────

export const DEMO_PRODUCTS: Omit<Product, 'id' | 'created_at'>[] = [
  {
    sku: 'SKU-WB750',
    product_name: 'Stainless Steel Water Bottle 750ml',
    product_family: 'Hydration',
    gtin: '08901234567890',
    barcodes: ['08901234567890'],
    variant: 'Standard',
    colour: 'Matte Black',
    expected_units_per_carton: 12,
    description: '750ml double-wall vacuum insulated water bottle with carabiner clip lid.',
    required_components: ['Bottle Body', 'Carabiner Lid', 'Silicone Sleeve'],
    active: true,
  },
  {
    sku: 'SKU-HC400',
    product_name: 'ProSport Hiking Cap',
    product_family: 'Headwear',
    gtin: '08907654321098',
    barcodes: ['08907654321098'],
    variant: 'OneSize',
    colour: 'Olive Green',
    expected_units_per_carton: 24,
    description: 'UV-protective breathable hiking cap with adjustable strap.',
    required_components: ['Cap', 'Hang Tag'],
    active: true,
  },
  {
    sku: 'SKU-TP200',
    product_name: 'Thermal Insulation Pad 200x200cm',
    product_family: 'Warehouse Accessories',
    gtin: '05012345678901',
    barcodes: ['05012345678901'],
    variant: '200x200',
    colour: 'Silver',
    expected_units_per_carton: 4,
    description: 'Heavy-duty thermal insulation floor pad, 200x200cm, 15mm thick.',
    required_components: ['Pad Roll'],
    active: true,
  },
  {
    sku: 'SKU-EH100',
    product_name: 'Ergonomic Warehouse Headset',
    product_family: 'Electronics',
    gtin: '07612345678905',
    barcodes: ['07612345678905'],
    variant: 'Wired',
    colour: 'Charcoal Grey',
    expected_units_per_carton: 6,
    description: 'Noise-cancelling warehouse headset with boom mic and USB-A adapter.',
    required_components: ['Headset', 'USB Adapter', 'Carry Pouch', 'Manual'],
    active: true,
  },
  {
    sku: 'SKU-MS300',
    product_name: 'Mechanical Floor Scale 300kg',
    product_family: 'Weighing Equipment',
    gtin: '04006381333931',
    barcodes: ['04006381333931'],
    variant: '300kg',
    colour: 'Industrial Yellow',
    expected_units_per_carton: 1,
    description: 'Heavy-duty mechanical platform scale rated to 300kg with 1kg graduation.',
    required_components: ['Scale Platform', 'Calibration Weight', 'Manual', 'Warranty Card'],
    active: true,
  },
];

// ─── PURCHASE ORDERS ──────────────────────────────────────────────────────────

export function buildDemoPurchaseOrders(
  supplierIds: { sup001: string; sup002: string; sup003: string },
  today: string
): Omit<PurchaseOrder, 'id' | 'created_at'>[] {
  return [
    {
      po_number: 'PO-2026-0041',
      supplier_id: supplierIds.sup001,
      supplier_name: 'TechGear Manufacturing Co.',
      expected_arrival_date: today,
      status: 'OPEN',
      lines: [
        {
          id: 'line-demo-1',
          purchase_order_id: 'pending',
          sku: 'SKU-WB750',
          product_name: 'Stainless Steel Water Bottle 750ml',
          gtin: '08901234567890',
          expected_cartons: 5,
          expected_units_per_carton: 12,
          expected_units: 60,
          expected_variant: 'Standard',
          expected_colour: 'Matte Black',
          required_components: ['Bottle Body', 'Carabiner Lid', 'Silicone Sleeve'],
        },
        {
          id: 'line-demo-2',
          purchase_order_id: 'pending',
          sku: 'SKU-EH100',
          product_name: 'Ergonomic Warehouse Headset',
          gtin: '07612345678905',
          expected_cartons: 3,
          expected_units_per_carton: 6,
          expected_units: 18,
          expected_variant: 'Wired',
          expected_colour: 'Charcoal Grey',
          required_components: ['Headset', 'USB Adapter', 'Carry Pouch', 'Manual'],
        },
      ],
    },
    {
      po_number: 'PO-2026-0042',
      supplier_id: supplierIds.sup002,
      supplier_name: 'ProSport Exports Ltd.',
      expected_arrival_date: today,
      status: 'OPEN',
      lines: [
        {
          id: 'line-demo-3',
          purchase_order_id: 'pending',
          sku: 'SKU-HC400',
          product_name: 'ProSport Hiking Cap',
          gtin: '08907654321098',
          expected_cartons: 10,
          expected_units_per_carton: 24,
          expected_units: 240,
          expected_variant: 'OneSize',
          expected_colour: 'Olive Green',
          required_components: ['Cap', 'Hang Tag'],
        },
      ],
    },
    {
      po_number: 'PO-2026-0039',
      supplier_id: supplierIds.sup003,
      supplier_name: 'Global Warehouse Solutions',
      expected_arrival_date: today,
      status: 'OPEN',
      lines: [
        {
          id: 'line-demo-4',
          purchase_order_id: 'pending',
          sku: 'SKU-MS300',
          product_name: 'Mechanical Floor Scale 300kg',
          gtin: '04006381333931',
          expected_cartons: 2,
          expected_units_per_carton: 1,
          expected_units: 2,
          expected_variant: '300kg',
          expected_colour: 'Industrial Yellow',
          required_components: ['Scale Platform', 'Calibration Weight', 'Manual', 'Warranty Card'],
        },
        {
          id: 'line-demo-5',
          purchase_order_id: 'pending',
          sku: 'SKU-TP200',
          product_name: 'Thermal Insulation Pad 200x200cm',
          gtin: '05012345678901',
          expected_cartons: 8,
          expected_units_per_carton: 4,
          expected_units: 32,
          expected_variant: '200x200',
          expected_colour: 'Silver',
          required_components: ['Pad Roll'],
        },
      ],
    },
  ];
}

// ─── PAST INSPECTIONS (for Analytics / Dashboard) ─────────────────────────────

export function buildDemoInspections(
  poIds: { po41: string; po42: string; po39: string }
): Inspection[] {
  const ts = (daysAgo: number, hour = 10, minute = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  const basePhoto = (type: string, inspId: string) => ({
    id: `${inspId}-photo-${type}`,
    inspection_id: inspId,
    photo_type: type as any,
    file_name: `${type.toLowerCase()}.jpg`,
    mime_type: 'image/jpeg',
    file_size: 204800,
    sha256_hash: `demo_${inspId}_${type}_hash`,
    captured_at: ts(1),
    quality_status: 'GOOD' as any,
  });

  const passCheck = (name: string, expected: unknown, observed: unknown, reason: string) => ({
    id: `check-${name}-${Math.random().toString(36).slice(2)}`,
    check_name: name as any,
    expected_value: expected,
    observed_value: observed,
    verdict: 'PASS' as any,
    confidence: 0.97,
    reason,
  });

  const failCheck = (name: string, expected: unknown, observed: unknown, reason: string) => ({
    id: `check-${name}-${Math.random().toString(36).slice(2)}`,
    check_name: name as any,
    expected_value: expected,
    observed_value: observed,
    verdict: 'FAIL' as any,
    confidence: 0.95,
    reason,
  });

  const uncertainCheck = (name: string, expected: unknown, observed: unknown, reason: string) => ({
    id: `check-${name}-${Math.random().toString(36).slice(2)}`,
    check_name: name as any,
    expected_value: expected,
    observed_value: observed,
    verdict: 'UNCERTAIN' as any,
    confidence: 0.45,
    reason,
  });

  const insp1 = 'insp-demo-001';
  const insp2 = 'insp-demo-002';
  const insp3 = 'insp-demo-003';
  const insp4 = 'insp-demo-004';
  const insp5 = 'insp-demo-005';

  return [
    // ✅ ACCEPT — Water Bottle, 5 cartons, barcode matched
    {
      id: insp1,
      inspection_number: 'INSP-900001',
      purchase_order_id: poIds.po41,
      po_number: 'PO-2026-0041',
      supplier_name: 'TechGear Manufacturing Co.',
      product_sku: 'SKU-WB750',
      product_name: 'Stainless Steel Water Bottle 750ml',
      operator_id: 'demo-operator',
      operator_name: 'Alex Johnson',
      status: 'ACCEPT',
      mode: 'PILOT',
      overall_confidence: 0.97,
      action_recommendation: 'Accept shipment into inventory.',
      barcode_scans: [{
        id: `${insp1}-scan-1`,
        inspection_id: insp1,
        barcode_value: '08901234567890',
        barcode_format: 'EAN_13',
        scan_source: 'CAMERA_SCAN',
        matched_product_id: 'prod-wb750',
        matched_sku: 'SKU-WB750',
        match_status: 'PASS',
        scanned_at: ts(2, 9, 15),
      }],
      photos: ['BARCODE_LABEL','CARTON_FRONT','CARTON_LEFT','CARTON_RIGHT','CARTON_TOP','SHIPMENT_OVERVIEW'].map(t => basePhoto(t, insp1)),
      checks: [
        passCheck('SKU_IDENTITY', 'SKU-WB750', 'SKU-WB750', 'SKU verified via GTIN 08901234567890 barcode match.'),
        passCheck('BARCODE_MATCH', '08901234567890', '08901234567890', 'Scanned barcode matches product catalogue GTIN.'),
        passCheck('CARTON_COUNT', 5, 5, 'Observed 5 cartons matching PO expected count.'),
        passCheck('UNITS_PER_CARTON', 12, 12, 'Label text confirms 12 units/carton.'),
        passCheck('TOTAL_QUANTITY', 60, 60, 'Total 60 units matches PO expectation.'),
        passCheck('VARIANT', 'Standard', 'Standard', 'Variant confirmed via barcode catalogue mapping.'),
        passCheck('COLOUR', 'Matte Black', 'Matte Black', 'Product colour visible on label: Matte Black.'),
        passCheck('DAMAGE', 'INTACT_NO_DAMAGE', 'NONE_OBSERVED', 'No physical damage observed in all 6 photos.'),
        passCheck('MISSING_COMPONENTS', 'COMPLETE_ALL_ACCESSORIES', 'ALL_PRESENT', 'Sealed cartons — factory intact.'),
        passCheck('PHOTO_COMPLETENESS', 'All perspectives', 'All 6 captured', 'All 6 mandatory photo perspectives captured.'),
      ],
      exceptions: [],
      observed_carton_count: 5,
      observed_units_per_carton: 12,
      observed_total_quantity: 60,
      manual_sku_verified: true,
      manual_sku_verified_by: 'Alex Johnson',
      manual_sku_verified_at: ts(2, 9, 10),
      manual_sku_notes: 'Barcode matches PO. All cartons present at dock gate.',
      created_at: ts(2, 9, 0),
      completed_at: ts(2, 9, 30),
    },

    // ✅ ACCEPT — Hiking Cap, all passed
    {
      id: insp2,
      inspection_number: 'INSP-900002',
      purchase_order_id: poIds.po42,
      po_number: 'PO-2026-0042',
      supplier_name: 'ProSport Exports Ltd.',
      product_sku: 'SKU-HC400',
      product_name: 'ProSport Hiking Cap',
      operator_id: 'demo-operator',
      operator_name: 'Priya Mehta',
      status: 'ACCEPT',
      mode: 'PILOT',
      overall_confidence: 0.96,
      action_recommendation: 'Accept shipment into inventory.',
      barcode_scans: [{
        id: `${insp2}-scan-1`,
        inspection_id: insp2,
        barcode_value: '08907654321098',
        barcode_format: 'EAN_13',
        scan_source: 'CAMERA_SCAN',
        matched_sku: 'SKU-HC400',
        match_status: 'PASS',
        scanned_at: ts(3, 14, 5),
      }],
      photos: ['BARCODE_LABEL','CARTON_FRONT','CARTON_LEFT','CARTON_RIGHT','CARTON_TOP','SHIPMENT_OVERVIEW'].map(t => basePhoto(t, insp2)),
      checks: [
        passCheck('SKU_IDENTITY', 'SKU-HC400', 'SKU-HC400', 'SKU confirmed via EAN-13 barcode.'),
        passCheck('BARCODE_MATCH', '08907654321098', '08907654321098', 'Barcode matches catalogue GTIN.'),
        passCheck('CARTON_COUNT', 10, 10, '10 cartons counted on dock.'),
        passCheck('UNITS_PER_CARTON', 24, 24, 'Carton label confirms 24 units.'),
        passCheck('TOTAL_QUANTITY', 240, 240, '240 units matches PO.'),
        passCheck('VARIANT', 'OneSize', 'OneSize', 'Variant confirmed.'),
        passCheck('COLOUR', 'Olive Green', 'Olive Green', 'Colour visible on outer carton label.'),
        passCheck('DAMAGE', 'INTACT_NO_DAMAGE', 'NONE_OBSERVED', 'All cartons intact.'),
        passCheck('MISSING_COMPONENTS', 'COMPLETE_ALL_ACCESSORIES', 'ALL_PRESENT', 'Factory sealed.'),
        passCheck('PHOTO_COMPLETENESS', 'All perspectives', 'All 6 captured', 'All 6 perspectives captured.'),
      ],
      exceptions: [],
      observed_carton_count: 10,
      observed_units_per_carton: 24,
      observed_total_quantity: 240,
      manual_sku_verified: true,
      manual_sku_verified_by: 'Priya Mehta',
      manual_sku_verified_at: ts(3, 14, 0),
      created_at: ts(3, 14, 0),
      completed_at: ts(3, 14, 25),
    },

    // ❌ EXCEPTION — Floor Scale, short shipment (1 carton instead of 2)
    {
      id: insp3,
      inspection_number: 'INSP-900003',
      purchase_order_id: poIds.po39,
      po_number: 'PO-2026-0039',
      supplier_name: 'Global Warehouse Solutions',
      product_sku: 'SKU-MS300',
      product_name: 'Mechanical Floor Scale 300kg',
      operator_id: 'demo-operator',
      operator_name: 'Alex Johnson',
      status: 'EXCEPTION',
      mode: 'PILOT',
      overall_confidence: 0.95,
      action_recommendation: 'Quarantine affected carton(s), preserve evidence, and initiate supplier review.',
      barcode_scans: [{
        id: `${insp3}-scan-1`,
        inspection_id: insp3,
        barcode_value: '04006381333931',
        barcode_format: 'EAN_13',
        scan_source: 'CAMERA_SCAN',
        matched_sku: 'SKU-MS300',
        match_status: 'PASS',
        scanned_at: ts(1, 11, 5),
      }],
      photos: ['BARCODE_LABEL','CARTON_FRONT','CARTON_LEFT','CARTON_RIGHT','CARTON_TOP','SHIPMENT_OVERVIEW'].map(t => basePhoto(t, insp3)),
      checks: [
        passCheck('SKU_IDENTITY', 'SKU-MS300', 'SKU-MS300', 'SKU confirmed via barcode.'),
        passCheck('BARCODE_MATCH', '04006381333931', '04006381333931', 'Barcode matches GTIN.'),
        failCheck('CARTON_COUNT', 2, 1, 'Short shipment: 1 carton received, 2 expected per PO.'),
        passCheck('UNITS_PER_CARTON', 1, 1, '1 unit per carton confirmed.'),
        failCheck('TOTAL_QUANTITY', 2, 1, 'Total 1 unit received vs 2 expected — short shipment.'),
        passCheck('VARIANT', '300kg', '300kg', 'Variant confirmed via label.'),
        passCheck('COLOUR', 'Industrial Yellow', 'Industrial Yellow', 'Colour matches.'),
        passCheck('DAMAGE', 'INTACT_NO_DAMAGE', 'NONE_OBSERVED', 'No damage detected.'),
        passCheck('MISSING_COMPONENTS', 'COMPLETE_ALL_ACCESSORIES', 'ALL_PRESENT', 'Components visible and complete.'),
        passCheck('PHOTO_COMPLETENESS', 'All perspectives', 'All 6 captured', '6 photos captured.'),
      ],
      exceptions: [{
        id: `${insp3}-exc-1`,
        inspection_id: insp3,
        purchase_order_id: poIds.po39,
        po_number: 'PO-2026-0039',
        supplier_name: 'Global Warehouse Solutions',
        product_sku: 'SKU-MS300',
        severity: 'HIGH',
        issue_type: 'SHORT_SHIPMENT_CARTONS',
        status: 'OPEN',
        notes: 'Received 1 carton vs 2 ordered. Supplier to be contacted for missing unit.',
        created_at: ts(1, 11, 30),
      }],
      observed_carton_count: 1,
      observed_units_per_carton: 1,
      observed_total_quantity: 1,
      manual_sku_verified: true,
      manual_sku_verified_by: 'Alex Johnson',
      manual_sku_verified_at: ts(1, 11, 0),
      created_at: ts(1, 11, 0),
      completed_at: ts(1, 11, 35),
    },

    // ⚠️ REVIEW_REQUIRED — Headset, barcode UNCERTAIN (blurry label)
    {
      id: insp4,
      inspection_number: 'INSP-900004',
      purchase_order_id: poIds.po41,
      po_number: 'PO-2026-0041',
      supplier_name: 'TechGear Manufacturing Co.',
      product_sku: 'SKU-EH100',
      product_name: 'Ergonomic Warehouse Headset',
      operator_id: 'demo-operator',
      operator_name: 'Priya Mehta',
      status: 'REVIEW_REQUIRED',
      mode: 'PILOT',
      overall_confidence: 0.51,
      action_recommendation: 'Do not accept automatically. Retake missing evidence or request manager verification.',
      barcode_scans: [],
      photos: ['BARCODE_LABEL','CARTON_FRONT','CARTON_LEFT','CARTON_RIGHT','CARTON_TOP','SHIPMENT_OVERVIEW'].map(t => basePhoto(t, insp4)),
      checks: [
        uncertainCheck('SKU_IDENTITY', 'SKU-EH100', null, 'Barcode label blurry — SKU not readable from photo evidence.'),
        uncertainCheck('BARCODE_MATCH', '07612345678905', null, 'No barcode scan provided. Manual entry pending.'),
        passCheck('CARTON_COUNT', 3, 3, '3 cartons counted on dock.'),
        uncertainCheck('UNITS_PER_CARTON', 6, null, 'Sealed cartons — units not verifiable without open carton photo.'),
        uncertainCheck('TOTAL_QUANTITY', 18, null, 'Total quantity uncertain pending SKU and unit verification.'),
        uncertainCheck('VARIANT', 'Wired', null, 'Variant not confirmed — label unreadable.'),
        uncertainCheck('COLOUR', 'Charcoal Grey', null, 'Colour not determinable from sealed carton exterior.'),
        passCheck('DAMAGE', 'INTACT_NO_DAMAGE', 'NONE_OBSERVED', 'No damage observed.'),
        uncertainCheck('MISSING_COMPONENTS', 'COMPLETE_ALL_ACCESSORIES', 'SEALED_NOT_VISIBLE', 'Contents sealed — components not visible.'),
        passCheck('PHOTO_COMPLETENESS', 'All perspectives', 'All 6 captured', '6 photos captured but barcode label blurry.'),
      ],
      exceptions: [],
      observed_carton_count: 3,
      observed_units_per_carton: undefined,
      observed_total_quantity: undefined,
      manual_sku_verified: true,
      manual_sku_verified_by: 'Priya Mehta',
      manual_sku_verified_at: ts(1, 15, 0),
      manual_sku_notes: 'Barcode label partially obscured by tape. Flagged for manager review.',
      created_at: ts(1, 15, 0),
      completed_at: ts(1, 15, 40),
    },

    // ✅ ACCEPT — Thermal Pad, clean pass
    {
      id: insp5,
      inspection_number: 'INSP-900005',
      purchase_order_id: poIds.po39,
      po_number: 'PO-2026-0039',
      supplier_name: 'Global Warehouse Solutions',
      product_sku: 'SKU-TP200',
      product_name: 'Thermal Insulation Pad 200x200cm',
      operator_id: 'demo-operator',
      operator_name: 'Alex Johnson',
      status: 'ACCEPT',
      mode: 'PILOT',
      overall_confidence: 0.98,
      action_recommendation: 'Accept shipment into inventory.',
      barcode_scans: [{
        id: `${insp5}-scan-1`,
        inspection_id: insp5,
        barcode_value: '05012345678901',
        barcode_format: 'EAN_13',
        scan_source: 'CAMERA_SCAN',
        matched_sku: 'SKU-TP200',
        match_status: 'PASS',
        scanned_at: ts(4, 16, 20),
      }],
      photos: ['BARCODE_LABEL','CARTON_FRONT','CARTON_LEFT','CARTON_RIGHT','CARTON_TOP','SHIPMENT_OVERVIEW'].map(t => basePhoto(t, insp5)),
      checks: [
        passCheck('SKU_IDENTITY', 'SKU-TP200', 'SKU-TP200', 'SKU verified via GTIN match.'),
        passCheck('BARCODE_MATCH', '05012345678901', '05012345678901', 'Barcode matches catalogue.'),
        passCheck('CARTON_COUNT', 8, 8, '8 cartons counted.'),
        passCheck('UNITS_PER_CARTON', 4, 4, 'Label confirms 4 rolls/carton.'),
        passCheck('TOTAL_QUANTITY', 32, 32, '32 units matches PO.'),
        passCheck('VARIANT', '200x200', '200x200', 'Dimensions confirmed on outer carton.'),
        passCheck('COLOUR', 'Silver', 'Silver', 'Silver foil visible on label.'),
        passCheck('DAMAGE', 'INTACT_NO_DAMAGE', 'NONE_OBSERVED', 'No damage.'),
        passCheck('MISSING_COMPONENTS', 'COMPLETE_ALL_ACCESSORIES', 'ALL_PRESENT', 'Sealed.'),
        passCheck('PHOTO_COMPLETENESS', 'All perspectives', 'All 6 captured', 'All 6 photos complete.'),
      ],
      exceptions: [],
      observed_carton_count: 8,
      observed_units_per_carton: 4,
      observed_total_quantity: 32,
      manual_sku_verified: true,
      manual_sku_verified_by: 'Alex Johnson',
      manual_sku_verified_at: ts(4, 16, 15),
      created_at: ts(4, 16, 10),
      completed_at: ts(4, 16, 45),
    },
  ];
}
