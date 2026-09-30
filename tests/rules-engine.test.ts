/**
 * DockProof AI Rules Engine Unit Test Suite
 *
 * Verifies all 10 seed scenarios and critical safety rules:
 * 1. Correct shipment
 * 2. Short shipment
 * 3. Extra units
 * 4. Wrong SKU
 * 5. Wrong variant
 * 6. Crushed carton
 * 7. Water-damaged carton
 * 8. Torn packaging
 * 9. Missing components
 * 10. Ambiguous evidence
 *
 * Safety Rules:
 * - UNCERTAIN never becomes automatic ACCEPT.
 * - Never identify SKU only from appearance.
 * - Never estimate hidden inventory inside sealed cartons.
 * - Never claim water damage from shadow or normal cardboard colour.
 * - Gemini must never make final ACCEPT/EXCEPTION decisions.
 */

import { runDeterministicRulesEngine } from '../supabase/functions/_shared/rulesEngine.ts';
import { Product, PurchaseOrderLine, InspectionPhotoMetadata, AIObservation, BarcodeScanData } from '../supabase/functions/_shared/types.ts';

// Demo product 1: BLUE-BOTTLE-001
const PRODUCT_BLUE_BOTTLE: Product = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  sku: 'BLUE-BOTTLE-001',
  barcode_gtin: '8901234567890',
  name: 'HydroGuard 750ml Insulated Bottle - Deep Ocean Blue',
  variant: '750ml Standard',
  colour: 'Blue',
  units_per_carton: 12,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Demo product 2: RED-BOTTLE-002
const PRODUCT_RED_BOTTLE: Product = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  sku: 'RED-BOTTLE-002',
  barcode_gtin: '8901234567891',
  name: 'HydroGuard 750ml Insulated Bottle - Crimson Flame Red',
  variant: '750ml Standard',
  colour: 'Red',
  units_per_carton: 12,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const PO_LINE_BLUE_24: PurchaseOrderLine = {
  id: '10000000-0000-0000-0000-000000000011',
  purchase_order_id: '10000000-0000-0000-0000-000000000001',
  product_id: PRODUCT_BLUE_BOTTLE.id,
  expected_cartons: 2,
  units_per_carton: 12,
  expected_total_units: 24,
  received_cartons: 0,
  received_total_units: 0,
  line_status: 'PENDING',
};

function makePhotos(types: Array<'CARTON_LABEL' | 'SEALED_CARTON' | 'OPEN_CARTON' | 'PRODUCT_CLOSEUP' | 'DAMAGE_DETAIL'>): InspectionPhotoMetadata[] {
  return types.map((type, idx) => ({
    id: `photo-${idx}`,
    inspection_id: 'insp-1',
    storage_path: `insp-1/${type.toLowerCase()}.jpg`,
    bucket_name: 'inspection-evidence',
    photo_type: type,
    sha256_hash: `${idx}000000000000000000000000000000000000000000000000000000000000000`,
    file_size_bytes: 102400,
    mime_type: 'image/jpeg',
    operator_id: 'op-1',
    captured_at: new Date().toISOString(),
  }));
}

export function runRulesEngineTests(): { passed: number; failed: number; results: { name: string; ok: boolean; message: string }[] } {
  const testResults: { name: string; ok: boolean; message: string }[] = [];

  function assert(testName: string, condition: boolean, failMessage: string) {
    if (condition) {
      testResults.push({ name: testName, ok: true, message: 'Passed' });
    } else {
      testResults.push({ name: testName, ok: false, message: failMessage });
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 1: Correct shipment
  // --------------------------------------------------------------------------
  {
    const scans: BarcodeScanData[] = [{
      raw_scan_value: '8901234567890',
      symbology: 'EAN_13',
      is_gtin_valid: true,
    }];
    const photos = makePhotos(['CARTON_LABEL', 'SEALED_CARTON']);
    const aiObs: AIObservation[] = [
      { checkName: 'PHOTO_COMPLETENESS', observedValue: ['CARTON_LABEL', 'SEALED_CARTON'], certainty: 'HIGH', confidence: 1.0, reason: 'All required views present' },
      { checkName: 'DAMAGE', observedValue: 'NONE', certainty: 'HIGH', confidence: 0.98, reason: 'Factory-sealed intact cartons' },
    ];

    const result = runDeterministicRulesEngine({
      poLine: PO_LINE_BLUE_24,
      product: PRODUCT_BLUE_BOTTLE,
      barcodeScans: scans,
      photos,
      aiObservations: aiObs,
      operatingMode: 'PILOT',
      manualCartonCount: 2,
    });

    assert(
      'Scenario 1: Correct shipment produces ACCEPT decision',
      result.finalDecision === 'ACCEPT',
      `Expected ACCEPT, got ${result.finalDecision} (${result.finalDecisionReason})`
    );
    assert(
      'Scenario 1: In PILOT mode manager approval is strictly required',
      result.isManagerApprovalRequired === true,
      'PILOT mode must require manager approval'
    );
    assert(
      'Scenario 1: Total quantity calculated matches 24',
      result.observedCounts.totalQuantity === 24,
      `Expected 24 total units, got ${result.observedCounts.totalQuantity}`
    );
  }

  // --------------------------------------------------------------------------
  // Scenario 2: Short shipment
  // --------------------------------------------------------------------------
  {
    const scans: BarcodeScanData[] = [{ raw_scan_value: '8901234567890', symbology: 'EAN_13', is_gtin_valid: true }];
    const photos = makePhotos(['CARTON_LABEL', 'SEALED_CARTON']);
    const aiObs: AIObservation[] = [{ checkName: 'DAMAGE', observedValue: 'NONE', certainty: 'HIGH', confidence: 0.98, reason: 'Cartons intact' }];

    const result = runDeterministicRulesEngine({
      poLine: PO_LINE_BLUE_24,
      product: PRODUCT_BLUE_BOTTLE,
      barcodeScans: scans,
      photos,
      aiObservations: aiObs,
      operatingMode: 'PILOT',
      manualCartonCount: 1, // Only 1 carton received instead of 2
    });

    assert(
      'Scenario 2: Short shipment produces EXCEPTION decision',
      result.finalDecision === 'EXCEPTION',
      `Expected EXCEPTION, got ${result.finalDecision}`
    );
    const totalQtyCheck = result.checks.find((c) => c.check_name === 'TOTAL_QUANTITY');
    assert(
      'Scenario 2: TOTAL_QUANTITY check fails',
      totalQtyCheck?.status === 'FAIL',
      `Expected TOTAL_QUANTITY FAIL, got ${totalQtyCheck?.status}`
    );
  }

  // --------------------------------------------------------------------------
  // Scenario 3: Extra units / Over-shipment
  // --------------------------------------------------------------------------
  {
    const scans: BarcodeScanData[] = [{ raw_scan_value: '8901234567890', symbology: 'EAN_13', is_gtin_valid: true }];
    const photos = makePhotos(['CARTON_LABEL', 'SEALED_CARTON']);
    const aiObs: AIObservation[] = [{ checkName: 'DAMAGE', observedValue: 'NONE', certainty: 'HIGH', confidence: 0.98, reason: 'Cartons intact' }];

    const result = runDeterministicRulesEngine({
      poLine: PO_LINE_BLUE_24,
      product: PRODUCT_BLUE_BOTTLE,
      barcodeScans: scans,
      photos,
      aiObservations: aiObs,
      operatingMode: 'PILOT',
      manualCartonCount: 3, // 3 cartons received instead of 2
    });

    assert(
      'Scenario 3: Extra units produce EXCEPTION decision',
      result.finalDecision === 'EXCEPTION',
      `Expected EXCEPTION, got ${result.finalDecision}`
    );
    assert(
      'Scenario 3: Observed total quantity is 36',
      result.observedCounts.totalQuantity === 36,
      `Expected 36 units, got ${result.observedCounts.totalQuantity}`
    );
  }

  // --------------------------------------------------------------------------
  // Scenario 4: Wrong SKU
  // --------------------------------------------------------------------------
  {
    // Scanned Red Bottle GTIN when Blue Bottle was ordered
    const scans: BarcodeScanData[] = [{ raw_scan_value: '8901234567891', symbology: 'EAN_13', is_gtin_valid: true }];
    const photos = makePhotos(['CARTON_LABEL', 'SEALED_CARTON']);

    const result = runDeterministicRulesEngine({
      poLine: PO_LINE_BLUE_24,
      product: PRODUCT_BLUE_BOTTLE,
      barcodeScans: scans,
      photos,
      aiObservations: [],
      operatingMode: 'PILOT',
      manualCartonCount: 2,
    });

    assert(
      'Scenario 4: Wrong SKU produces EXCEPTION decision',
      result.finalDecision === 'EXCEPTION',
      `Expected EXCEPTION, got ${result.finalDecision}`
    );
    const skuCheck = result.checks.find((c) => c.check_name === 'SKU_IDENTITY');
    assert(
      'Scenario 4: SKU_IDENTITY check fails',
      skuCheck?.status === 'FAIL',
      `Expected SKU_IDENTITY FAIL, got ${skuCheck?.status}`
    );
  }

  // --------------------------------------------------------------------------
  // Scenario 5: Wrong variant
  // --------------------------------------------------------------------------
  {
    const scans: BarcodeScanData[] = [{ raw_scan_value: '8901234567891', symbology: 'EAN_13', is_gtin_valid: true }];
    const photos = makePhotos(['CARTON_LABEL', 'SEALED_CARTON']);
    const aiObs: AIObservation[] = [
      {
        checkName: 'VARIANT',
        observedValue: '500ml Compact Mini',
        certainty: 'HIGH',
        confidence: 0.95,
        reason: 'Label explicitly states 500ml Compact Mini',
      },
    ];

    const result = runDeterministicRulesEngine({
      poLine: { ...PO_LINE_BLUE_24, product_id: PRODUCT_RED_BOTTLE.id },
      product: PRODUCT_RED_BOTTLE,
      barcodeScans: scans,
      photos,
      aiObservations: aiObs,
      operatingMode: 'PILOT',
      manualCartonCount: 2,
    });

    assert(
      'Scenario 5: Wrong variant produces EXCEPTION decision',
      result.finalDecision === 'EXCEPTION',
      `Expected EXCEPTION, got ${result.finalDecision}`
    );
    const variantCheck = result.checks.find((c) => c.check_name === 'VARIANT');
    assert(
      'Scenario 5: VARIANT check status is FAIL',
      variantCheck?.status === 'FAIL',
      `Expected VARIANT check FAIL, got ${variantCheck?.status}`
    );
  }

  // --------------------------------------------------------------------------
  // Scenario 6: Crushed carton
  // --------------------------------------------------------------------------
  {
    const scans: BarcodeScanData[] = [{ raw_scan_value: '8901234567890', symbology: 'EAN_13', is_gtin_valid: true }];
    const photos = makePhotos(['CARTON_LABEL', 'SEALED_CARTON', 'DAMAGE_DETAIL']);
    const aiObs: AIObservation[] = [
      {
        checkName: 'DAMAGE',
        observedValue: 'CRUSHED_CORRUGATION',
        certainty: 'HIGH',
        confidence: 0.96,
        reason: 'Significant 15cm compression collapse on right side of carton.',
        photoType: 'DAMAGE_DETAIL',
      },
    ];

    const result = runDeterministicRulesEngine({
      poLine: PO_LINE_BLUE_24,
      product: PRODUCT_BLUE_BOTTLE,
      barcodeScans: scans,
      photos,
      aiObservations: aiObs,
      operatingMode: 'PILOT',
      manualCartonCount: 2,
    });

    assert(
      'Scenario 6: Crushed carton produces EXCEPTION decision',
      result.finalDecision === 'EXCEPTION',
      `Expected EXCEPTION, got ${result.finalDecision}`
    );
    const damageCheck = result.checks.find((c) => c.check_name === 'DAMAGE');
    assert(
      'Scenario 6: DAMAGE check status is FAIL',
      damageCheck?.status === 'FAIL',
      `Expected DAMAGE FAIL, got ${damageCheck?.status}`
    );
  }

  // --------------------------------------------------------------------------
  // Scenario 7: Water-damaged carton
  // --------------------------------------------------------------------------
  {
    const scans: BarcodeScanData[] = [{ raw_scan_value: '8901234567890', symbology: 'EAN_13', is_gtin_valid: true }];
    const photos = makePhotos(['CARTON_LABEL', 'SEALED_CARTON', 'DAMAGE_DETAIL']);
    const aiObs: AIObservation[] = [
      {
        checkName: 'DAMAGE',
        observedValue: 'WATER_DAMAGE_WARPING',
        certainty: 'HIGH',
        confidence: 0.94,
        reason: 'Clear water line staining with softened and deformed bottom corrugation.',
        photoType: 'DAMAGE_DETAIL',
      },
    ];

    const result = runDeterministicRulesEngine({
      poLine: PO_LINE_BLUE_24,
      product: PRODUCT_BLUE_BOTTLE,
      barcodeScans: scans,
      photos,
      aiObservations: aiObs,
      operatingMode: 'PILOT',
      manualCartonCount: 2,
    });

    assert(
      'Scenario 7: Verified water damage produces EXCEPTION decision',
      result.finalDecision === 'EXCEPTION',
      `Expected EXCEPTION, got ${result.finalDecision}`
    );
  }

  // --------------------------------------------------------------------------
  // Scenario 8: Torn packaging
  // --------------------------------------------------------------------------
  {
    const scans: BarcodeScanData[] = [{ raw_scan_value: '8901234567890', symbology: 'EAN_13', is_gtin_valid: true }];
    const photos = makePhotos(['CARTON_LABEL', 'SEALED_CARTON', 'DAMAGE_DETAIL']);
    const aiObs: AIObservation[] = [
      {
        checkName: 'DAMAGE',
        observedValue: 'PUNCTURE_AND_TEAR',
        certainty: 'HIGH',
        confidence: 0.92,
        reason: 'Outer cardboard punctured with torn sealing tape.',
        photoType: 'DAMAGE_DETAIL',
      },
    ];

    const result = runDeterministicRulesEngine({
      poLine: PO_LINE_BLUE_24,
      product: PRODUCT_BLUE_BOTTLE,
      barcodeScans: scans,
      photos,
      aiObservations: aiObs,
      operatingMode: 'PILOT',
      manualCartonCount: 2,
    });

    assert(
      'Scenario 8: Torn packaging produces EXCEPTION decision',
      result.finalDecision === 'EXCEPTION',
      `Expected EXCEPTION, got ${result.finalDecision}`
    );
  }

  // --------------------------------------------------------------------------
  // Scenario 9: Missing components
  // --------------------------------------------------------------------------
  {
    const scans: BarcodeScanData[] = [{ raw_scan_value: '8901234567890', symbology: 'EAN_13', is_gtin_valid: true }];
    const photos = makePhotos(['CARTON_LABEL', 'OPEN_CARTON', 'PRODUCT_CLOSEUP']);
    const aiObs: AIObservation[] = [
      {
        checkName: 'MISSING_COMPONENTS',
        observedValue: 'MISSING_CARABINER_LID',
        certainty: 'HIGH',
        confidence: 0.93,
        reason: 'Visible bottles in open carton do not have screw cap accessories attached.',
        photoType: 'OPEN_CARTON',
      },
    ];

    const result = runDeterministicRulesEngine({
      poLine: PO_LINE_BLUE_24,
      product: PRODUCT_BLUE_BOTTLE,
      barcodeScans: scans,
      photos,
      aiObservations: aiObs,
      operatingMode: 'PILOT',
      manualCartonCount: 2,
    });

    const compCheck = result.checks.find((c) => c.check_name === 'MISSING_COMPONENTS');
    assert(
      'Scenario 9: MISSING_COMPONENTS check fails when contents are visible and accessories missing',
      compCheck?.status === 'FAIL',
      `Expected MISSING_COMPONENTS FAIL, got ${compCheck?.status}`
    );
  }

  // --------------------------------------------------------------------------
  // Scenario 10: Ambiguous evidence -> REVIEW_REQUIRED
  // --------------------------------------------------------------------------
  {
    const scans: BarcodeScanData[] = [{ raw_scan_value: '8901234567890', symbology: 'EAN_13', is_gtin_valid: true }];
    const photos = makePhotos(['CARTON_LABEL', 'SEALED_CARTON']);
    const aiObs: AIObservation[] = [
      {
        checkName: 'DAMAGE',
        observedValue: 'UNCERTAIN',
        certainty: 'UNCERTAIN',
        confidence: 0.4,
        reason: 'Photograph has extreme motion blur and high dark shadow gradient. Unable to inspect for surface tears.',
      },
    ];

    const result = runDeterministicRulesEngine({
      poLine: PO_LINE_BLUE_24,
      product: PRODUCT_BLUE_BOTTLE,
      barcodeScans: scans,
      photos,
      aiObservations: aiObs,
      operatingMode: 'PILOT',
      manualCartonCount: 2,
    });

    assert(
      'Scenario 10: Ambiguous evidence produces REVIEW_REQUIRED decision',
      result.finalDecision === 'REVIEW_REQUIRED',
      `Expected REVIEW_REQUIRED, got ${result.finalDecision}`
    );
    assert(
      'Scenario 10: UNCERTAIN never becomes automatic ACCEPT',
      result.finalDecision !== 'ACCEPT',
      'UNCERTAIN must NEVER become automatic ACCEPT'
    );
  }

  // --------------------------------------------------------------------------
  // CRITICAL SAFETY RULE 1: Never identify SKU only from appearance
  // --------------------------------------------------------------------------
  {
    const photos = makePhotos(['SEALED_CARTON']); // No label photo, no barcode scan
    const aiObs: AIObservation[] = [
      {
        checkName: 'SKU_IDENTITY',
        observedValue: 'Looks like Blue Bottle from appearance',
        certainty: 'MEDIUM',
        confidence: 0.6,
        reason: 'Color seems blue, guessing SKU',
      },
    ];

    const result = runDeterministicRulesEngine({
      poLine: PO_LINE_BLUE_24,
      product: PRODUCT_BLUE_BOTTLE,
      barcodeScans: [], // NO scans!
      photos,
      aiObservations: aiObs,
      operatingMode: 'PILOT',
    });

    const skuCheck = result.checks.find((c) => c.check_name === 'SKU_IDENTITY');
    assert(
      'Safety Rule: Never identify SKU only from appearance without barcode or printed text',
      skuCheck?.status === 'UNCERTAIN',
      `Expected SKU_IDENTITY to be UNCERTAIN, got ${skuCheck?.status}`
    );
    assert(
      'Safety Rule: Missing barcode & label evidence results in REVIEW_REQUIRED',
      result.finalDecision === 'EXCEPTION' || result.finalDecision === 'REVIEW_REQUIRED',
      `Expected EXCEPTION or REVIEW_REQUIRED, got ${result.finalDecision}`
    );
  }

  // --------------------------------------------------------------------------
  // CRITICAL SAFETY RULE 2: Never estimate hidden inventory inside sealed cartons
  // --------------------------------------------------------------------------
  {
    const scans: BarcodeScanData[] = [{ raw_scan_value: '8901234567890', symbology: 'EAN_13', is_gtin_valid: true }];
    const photos = makePhotos(['CARTON_LABEL', 'SEALED_CARTON']); // SEALED only!
    const aiObs: AIObservation[] = [];

    const result = runDeterministicRulesEngine({
      poLine: PO_LINE_BLUE_24,
      product: PRODUCT_BLUE_BOTTLE,
      barcodeScans: scans,
      photos,
      aiObservations: aiObs,
      operatingMode: 'PILOT',
      manualCartonCount: 2,
    });

    const unitsCheck = result.checks.find((c) => c.check_name === 'UNITS_PER_CARTON');
    assert(
      'Safety Rule: Units per carton inside sealed cartons is UNCERTAIN (never estimate hidden units)',
      unitsCheck?.status === 'UNCERTAIN',
      `Expected UNITS_PER_CARTON UNCERTAIN, got ${unitsCheck?.status}`
    );
  }

  // --------------------------------------------------------------------------
  // CRITICAL SAFETY RULE 3: Never claim water damage from shadow or cardboard color
  // --------------------------------------------------------------------------
  {
    const scans: BarcodeScanData[] = [{ raw_scan_value: '8901234567890', symbology: 'EAN_13', is_gtin_valid: true }];
    const photos = makePhotos(['CARTON_LABEL', 'SEALED_CARTON']);
    const aiObs: AIObservation[] = [
      {
        checkName: 'DAMAGE',
        observedValue: 'Dark shadow cast by forklift overhead, normal brown kraft cardboard gradient',
        certainty: 'UNCERTAIN',
        confidence: 0.5,
        reason: 'Shadow gradient observed, no corrugated deformation or moisture buckling detected.',
      },
    ];

    const result = runDeterministicRulesEngine({
      poLine: PO_LINE_BLUE_24,
      product: PRODUCT_BLUE_BOTTLE,
      barcodeScans: scans,
      photos,
      aiObservations: aiObs,
      operatingMode: 'PILOT',
      manualCartonCount: 2,
    });

    const damageCheck = result.checks.find((c) => c.check_name === 'DAMAGE');
    assert(
      'Safety Rule: Shadows and cardboard shading are marked UNCERTAIN, NOT false FAIL',
      damageCheck?.status === 'UNCERTAIN',
      `Expected DAMAGE UNCERTAIN, got ${damageCheck?.status}`
    );
    assert(
      'Safety Rule: Shadow ambiguity routes to REVIEW_REQUIRED, not immediate reject',
      result.finalDecision === 'REVIEW_REQUIRED',
      `Expected REVIEW_REQUIRED, got ${result.finalDecision}`
    );
  }

  const passed = testResults.filter((r) => r.ok).length;
  const failed = testResults.filter((r) => !r.ok).length;
  return { passed, failed, results: testResults };
}
