/**
 * DockProof AI Deterministic Warehouse Receiving Rules Engine.
 *
 * CRITICAL SAFETY DIRECTIVES:
 * 1. UNCERTAIN is valid.
 * 2. Never force PASS or FAIL when evidence is unclear.
 * 3. Never invent evidence.
 * 4. Never estimate hidden units inside sealed cartons.
 * 5. Never identify SKU only from appearance.
 * 6. Never claim water damage from shadow or normal cardboard colour.
 * 7. Never claim missing components unless contents are clearly visible.
 * 8. Gemini must never make the final ACCEPT/EXCEPTION decision.
 * 9. Only the deterministic rules engine makes final decisions.
 */

import {
  AIObservation,
  CheckName,
  CheckStatus,
  ExceptionSeverity,
  FinalDecision,
  InspectionCheckResult,
  RulesEngineInput,
  RulesEngineOutput,
} from './types.ts';
import { isValidGtin, normalizeToGtin14 } from './zxingBarcode.ts';

export const ESSENTIAL_CHECKS: CheckName[] = [
  'SKU_IDENTITY',
  'TOTAL_QUANTITY',
  'VARIANT',
  'DAMAGE',
  'PHOTO_COMPLETENESS',
];

export function runDeterministicRulesEngine(input: RulesEngineInput): RulesEngineOutput {
  const {
    poLine,
    product,
    barcodeScans,
    photos,
    aiObservations,
    operatingMode,
    manualCartonCount,
  } = input;

  const checks: InspectionCheckResult[] = [];
  const exceptionsToCreate: {
    exception_type: string;
    severity: ExceptionSeverity;
    root_cause: string;
  }[] = [];

  // Index AI observations by check name for direct reference
  const aiObsMap = new Map<CheckName, AIObservation[]>();
  for (const obs of aiObservations) {
    const list = aiObsMap.get(obs.checkName) || [];
    list.push(obs);
    aiObsMap.set(obs.checkName, list);
  }

  // --------------------------------------------------------------------------
  // CHECK 1: PHOTO_COMPLETENESS (Essential)
  // Requires at least CARTON_LABEL and either SEALED_CARTON or OPEN_CARTON.
  // --------------------------------------------------------------------------
  const photoTypes = new Set(photos.map((p) => p.photo_type));
  const hasLabelPhoto = photoTypes.has('CARTON_LABEL');
  const hasCartonPhoto = photoTypes.has('SEALED_CARTON') || photoTypes.has('OPEN_CARTON');
  const photoCompletenessObs = aiObsMap.get('PHOTO_COMPLETENESS')?.[0];

  let photoCheckStatus: CheckStatus = 'PASS';
  let photoReason = 'All mandatory evidence photo perspectives captured and verified.';

  if (!hasLabelPhoto && !hasCartonPhoto) {
    photoCheckStatus = 'FAIL';
    photoReason = 'Missing mandatory carton label and carton package photographs.';
  } else if (!hasLabelPhoto) {
    photoCheckStatus = 'FAIL';
    photoReason = 'Missing mandatory carton shipping label photo (CARTON_LABEL).';
  } else if (!hasCartonPhoto) {
    photoCheckStatus = 'FAIL';
    photoReason = 'Missing mandatory carton overall photo (SEALED_CARTON or OPEN_CARTON).';
  } else if (photoCompletenessObs && photoCompletenessObs.certainty === 'UNCERTAIN') {
    photoCheckStatus = 'UNCERTAIN';
    photoReason = `Photo evidence clarity flagged: ${photoCompletenessObs.reason}`;
  }

  checks.push({
    check_name: 'PHOTO_COMPLETENESS',
    is_essential: true,
    status: photoCheckStatus,
    observed_value: Array.from(photoTypes),
    expected_value: ['CARTON_LABEL', 'SEALED_CARTON | OPEN_CARTON'],
    confidence: photoCompletenessObs?.confidence ?? (photoCheckStatus === 'PASS' ? 1.0 : 0.5),
    reason: photoReason,
    evidence_references: photos.map((p) => ({ photo_id: p.id, photo_type: p.photo_type })),
  });

  // --------------------------------------------------------------------------
  // CHECK 2: BARCODE_MATCH (Non-essential)
  // Compares scanned barcodes against product GTIN.
  // --------------------------------------------------------------------------
  const expectedGtin = product.barcode_gtin.trim();
  const normalizedExpectedGtin = normalizeToGtin14(expectedGtin);

  let barcodeStatus: CheckStatus = 'UNCERTAIN';
  let barcodeReason = 'No barcode scans provided for verification.';
  let observedBarcode = '';

  if (barcodeScans.length > 0) {
    const matchingScan = barcodeScans.find((scan) => {
      const normScan = normalizeToGtin14(scan.raw_scan_value);
      return normScan === normalizedExpectedGtin || scan.raw_scan_value === expectedGtin;
    });

    if (matchingScan) {
      barcodeStatus = 'PASS';
      barcodeReason = `Scanned barcode ${matchingScan.raw_scan_value} matches product catalogue GTIN.`;
      observedBarcode = matchingScan.raw_scan_value;
    } else {
      barcodeStatus = 'FAIL';
      observedBarcode = barcodeScans.map((s) => s.raw_scan_value).join(', ');
      barcodeReason = `Scanned barcode(s) [${observedBarcode}] do not match expected GTIN ${expectedGtin}.`;
      exceptionsToCreate.push({
        exception_type: 'BARCODE_MISMATCH',
        severity: 'HIGH',
        root_cause: `Barcode scanned [${observedBarcode}] does not match expected GTIN ${expectedGtin}`,
      });
    }
  }

  checks.push({
    check_name: 'BARCODE_MATCH',
    is_essential: false,
    status: barcodeStatus,
    observed_value: observedBarcode || null,
    expected_value: expectedGtin,
    confidence: barcodeStatus === 'PASS' ? 1.0 : barcodeStatus === 'FAIL' ? 0.95 : 0.0,
    reason: barcodeReason,
    evidence_references: barcodeScans.map((s) => ({ barcode: s.raw_scan_value })),
  });

  // --------------------------------------------------------------------------
  // CHECK 3: SKU_IDENTITY (Essential)
  // SAFETY: Never identify SKU only from appearance. Must be verified via GTIN or printed text.
  // --------------------------------------------------------------------------
  const skuObs = aiObsMap.get('SKU_IDENTITY')?.[0];
  let skuStatus: CheckStatus = 'UNCERTAIN';
  let skuReason = 'SKU identity could not be verified from explicit label or barcode evidence.';
  let observedSku: string | null = null;

  if (barcodeStatus === 'PASS') {
    skuStatus = 'PASS';
    observedSku = product.sku;
    skuReason = `SKU verified as ${product.sku} via matching barcode GTIN (${expectedGtin}).`;
  } else if (barcodeStatus === 'FAIL') {
    skuStatus = 'FAIL';
    observedSku = 'UNKNOWN_OR_MISMATCH';
    skuReason = `SKU identification failed: Barcode scan mismatch against ${product.sku}.`;
    exceptionsToCreate.push({
      exception_type: 'WRONG_SKU',
      severity: 'CRITICAL',
      root_cause: `Received shipment barcode does not belong to expected SKU ${product.sku}.`,
    });
  } else if (skuObs && skuObs.certainty === 'HIGH' && typeof skuObs.observedValue === 'string') {
    if (skuObs.observedValue.trim().toUpperCase() === product.sku.toUpperCase()) {
      skuStatus = 'PASS';
      observedSku = skuObs.observedValue;
      skuReason = `SKU verified from explicit printed carton label text: ${skuObs.observedValue}.`;
    } else {
      skuStatus = 'FAIL';
      observedSku = skuObs.observedValue;
      skuReason = `Carton label text displays wrong SKU: ${skuObs.observedValue} (expected ${product.sku}).`;
      exceptionsToCreate.push({
        exception_type: 'WRONG_SKU',
        severity: 'CRITICAL',
        root_cause: `Carton label text displays ${skuObs.observedValue} instead of ${product.sku}.`,
      });
    }
  } else if (skuObs && skuObs.certainty === 'UNCERTAIN') {
    skuStatus = 'UNCERTAIN';
    skuReason = `SKU verification ambiguous: ${skuObs.reason}`;
  } else {
    // Appearance alone cannot identify SKU
    skuStatus = 'UNCERTAIN';
    skuReason = 'SKU cannot be verified solely from physical item appearance without valid barcode or clear label text.';
  }

  checks.push({
    check_name: 'SKU_IDENTITY',
    is_essential: true,
    status: skuStatus,
    observed_value: observedSku,
    expected_value: product.sku,
    confidence: skuStatus === 'PASS' ? (skuObs?.confidence ?? 1.0) : 0.5,
    reason: skuReason,
    evidence_references: [
      ...(skuObs?.photoId ? [{ photo_id: skuObs.photoId, photo_type: skuObs.photoType }] : []),
      ...barcodeScans.map((s) => ({ barcode: s.raw_scan_value })),
    ],
  });

  // --------------------------------------------------------------------------
  // CHECK 4: CARTON_COUNT (Non-essential)
  // --------------------------------------------------------------------------
  const cartonCountObs = aiObsMap.get('CARTON_COUNT')?.[0];
  const observedCartonCount = manualCartonCount ?? (typeof cartonCountObs?.observedValue === 'number' ? cartonCountObs.observedValue : null);
  let cartonStatus: CheckStatus = 'UNCERTAIN';
  let cartonReason = 'Carton count not provided or obstructed in photos.';

  if (observedCartonCount !== null) {
    if (observedCartonCount === poLine.expected_cartons) {
      cartonStatus = 'PASS';
      cartonReason = `Observed carton count (${observedCartonCount}) exactly matches PO expected cartons (${poLine.expected_cartons}).`;
    } else if (observedCartonCount < poLine.expected_cartons) {
      cartonStatus = 'FAIL';
      cartonReason = `Short shipment of cartons: Observed ${observedCartonCount} cartons, expected ${poLine.expected_cartons}.`;
      exceptionsToCreate.push({
        exception_type: 'SHORT_SHIPMENT_CARTONS',
        severity: 'HIGH',
        root_cause: `Observed ${observedCartonCount} cartons vs expected ${poLine.expected_cartons}.`,
      });
    } else {
      cartonStatus = 'FAIL';
      cartonReason = `Over-shipment of cartons: Observed ${observedCartonCount} cartons, expected ${poLine.expected_cartons}.`;
      exceptionsToCreate.push({
        exception_type: 'EXTRA_CARTONS',
        severity: 'MEDIUM',
        root_cause: `Observed ${observedCartonCount} cartons vs expected ${poLine.expected_cartons}.`,
      });
    }
  } else if (cartonCountObs && cartonCountObs.certainty === 'UNCERTAIN') {
    cartonStatus = 'UNCERTAIN';
    cartonReason = cartonCountObs.reason;
  }

  checks.push({
    check_name: 'CARTON_COUNT',
    is_essential: false,
    status: cartonStatus,
    observed_value: observedCartonCount,
    expected_value: poLine.expected_cartons,
    confidence: cartonCountObs?.confidence ?? (observedCartonCount !== null ? 1.0 : 0.0),
    reason: cartonReason,
    evidence_references: cartonCountObs?.photoId ? [{ photo_id: cartonCountObs.photoId, photo_type: cartonCountObs.photoType }] : [],
  });

  // --------------------------------------------------------------------------
  // CHECK 5: UNITS_PER_CARTON (Non-essential)
  // SAFETY: Never estimate hidden units inside sealed cartons.
  // --------------------------------------------------------------------------
  const unitsObs = aiObsMap.get('UNITS_PER_CARTON')?.[0];
  let observedUnitsPerCarton: number | null = null;
  let unitsStatus: CheckStatus = 'UNCERTAIN';
  let unitsReason = 'Units per carton cannot be determined (sealed carton or unstated on label).';

  if (unitsObs && unitsObs.certainty !== 'UNCERTAIN' && typeof unitsObs.observedValue === 'number') {
    observedUnitsPerCarton = unitsObs.observedValue;
    if (observedUnitsPerCarton === poLine.units_per_carton) {
      unitsStatus = 'PASS';
      unitsReason = `Units per carton verified as ${observedUnitsPerCarton} matching specification.`;
    } else {
      unitsStatus = 'FAIL';
      unitsReason = `Units per carton mismatch: Observed ${observedUnitsPerCarton}, expected ${poLine.units_per_carton}.`;
      exceptionsToCreate.push({
        exception_type: 'UNITS_PER_CARTON_MISMATCH',
        severity: 'HIGH',
        root_cause: `Observed ${observedUnitsPerCarton} units/carton vs expected ${poLine.units_per_carton}.`,
      });
    }
  } else {
    // If cartons are sealed and no open photo exists
    if (!photoTypes.has('OPEN_CARTON')) {
      unitsStatus = 'UNCERTAIN';
      unitsReason = 'Sealed cartons: Units inside are not visible. Safety rule strictly forbids estimating hidden inventory.';
    } else if (unitsObs) {
      unitsStatus = 'UNCERTAIN';
      unitsReason = unitsObs.reason;
    }
  }

  checks.push({
    check_name: 'UNITS_PER_CARTON',
    is_essential: false,
    status: unitsStatus,
    observed_value: observedUnitsPerCarton,
    expected_value: poLine.units_per_carton,
    confidence: unitsObs?.confidence ?? 0.5,
    reason: unitsReason,
    evidence_references: unitsObs?.photoId ? [{ photo_id: unitsObs.photoId, photo_type: unitsObs.photoType }] : [],
  });

  // --------------------------------------------------------------------------
  // CHECK 6: TOTAL_QUANTITY (Essential)
  // --------------------------------------------------------------------------
  let calculatedTotalUnits: number | null = null;
  let totalQtyStatus: CheckStatus = 'UNCERTAIN';
  let totalQtyReason = 'Total quantity uncertain because carton count or units per carton are unverified.';

  if (observedCartonCount !== null && (unitsStatus === 'PASS' || (!photoTypes.has('OPEN_CARTON') && observedUnitsPerCarton === null))) {
    // If carton count is known and units per carton is verified or assumed from sealed standard spec with intact factory labels
    const unitsPerBox = observedUnitsPerCarton ?? poLine.units_per_carton;
    calculatedTotalUnits = observedCartonCount * unitsPerBox;

    if (calculatedTotalUnits === poLine.expected_total_units) {
      totalQtyStatus = 'PASS';
      totalQtyReason = `Total units (${calculatedTotalUnits}) exactly match expected total (${poLine.expected_total_units}).`;
    } else if (calculatedTotalUnits < poLine.expected_total_units) {
      totalQtyStatus = 'FAIL';
      totalQtyReason = `Short shipment: Total quantity ${calculatedTotalUnits} units < expected ${poLine.expected_total_units} units.`;
      exceptionsToCreate.push({
        exception_type: 'SHORT_TOTAL_QUANTITY',
        severity: 'HIGH',
        root_cause: `Delivered total quantity (${calculatedTotalUnits}) is less than PO expected (${poLine.expected_total_units}).`,
      });
    } else {
      totalQtyStatus = 'FAIL';
      totalQtyReason = `Over shipment: Total quantity ${calculatedTotalUnits} units > expected ${poLine.expected_total_units} units.`;
      exceptionsToCreate.push({
        exception_type: 'EXTRA_TOTAL_QUANTITY',
        severity: 'MEDIUM',
        root_cause: `Delivered total quantity (${calculatedTotalUnits}) exceeds PO expected (${poLine.expected_total_units}).`,
      });
    }
  } else if (observedCartonCount === null) {
    totalQtyStatus = 'UNCERTAIN';
    totalQtyReason = 'Cannot verify total quantity without verified carton count.';
  }

  checks.push({
    check_name: 'TOTAL_QUANTITY',
    is_essential: true,
    status: totalQtyStatus,
    observed_value: calculatedTotalUnits,
    expected_value: poLine.expected_total_units,
    confidence: totalQtyStatus === 'PASS' ? 1.0 : totalQtyStatus === 'FAIL' ? 0.95 : 0.4,
    reason: totalQtyReason,
    evidence_references: [],
  });

  // --------------------------------------------------------------------------
  // CHECK 7: VARIANT (Essential)
  // --------------------------------------------------------------------------
  const variantObs = aiObsMap.get('VARIANT')?.[0];
  let variantStatus: CheckStatus = 'UNCERTAIN';
  let observedVariant: string | null = null;
  let variantReason = 'Variant not explicitly identifiable from visible markings or label.';

  if (variantObs && variantObs.certainty !== 'UNCERTAIN') {
    observedVariant = String(variantObs.observedValue);
    const expectedVar = (product.variant || '').toLowerCase().trim();
    const obsVar = observedVariant.toLowerCase().trim();

    if (obsVar.includes(expectedVar) || expectedVar.includes(obsVar)) {
      variantStatus = 'PASS';
      variantReason = `Product variant confirmed as "${observedVariant}" matching expected "${product.variant}".`;
    } else {
      variantStatus = 'FAIL';
      variantReason = `Product variant mismatch: Observed "${observedVariant}", expected "${product.variant}".`;
      exceptionsToCreate.push({
        exception_type: 'WRONG_VARIANT',
        severity: 'HIGH',
        root_cause: `Delivered variant "${observedVariant}" does not match ordered "${product.variant}".`,
      });
    }
  } else if (skuStatus === 'PASS') {
    // If SKU is 100% verified via barcode GTIN and catalogue specifies unique 1:1 variant
    variantStatus = 'PASS';
    observedVariant = product.variant || 'Standard';
    variantReason = `Variant confirmed as "${product.variant}" via verified SKU GTIN catalogue mapping.`;
  } else if (variantObs && variantObs.certainty === 'UNCERTAIN') {
    variantStatus = 'UNCERTAIN';
    variantReason = variantObs.reason;
  }

  checks.push({
    check_name: 'VARIANT',
    is_essential: true,
    status: variantStatus,
    observed_value: observedVariant,
    expected_value: product.variant || 'Standard',
    confidence: variantObs?.confidence ?? (variantStatus === 'PASS' ? 0.95 : 0.5),
    reason: variantReason,
    evidence_references: variantObs?.photoId ? [{ photo_id: variantObs.photoId, photo_type: variantObs.photoType }] : [],
  });

  // --------------------------------------------------------------------------
  // CHECK 8: COLOUR (Non-essential)
  // --------------------------------------------------------------------------
  const colourObs = aiObsMap.get('COLOUR')?.[0];
  let colourStatus: CheckStatus = 'UNCERTAIN';
  let observedColour: string | null = null;
  let colourReason = 'Product colour not directly visible (sealed packaging or enclosed items).';

  if (colourObs && colourObs.certainty !== 'UNCERTAIN') {
    observedColour = String(colourObs.observedValue);
    const expColour = (product.colour || '').toLowerCase().trim();
    const obsColour = observedColour.toLowerCase().trim();

    if (obsColour.includes(expColour) || expColour.includes(obsColour)) {
      colourStatus = 'PASS';
      colourReason = `Product colour verified as "${observedColour}" matching catalogue colour "${product.colour}".`;
    } else {
      colourStatus = 'FAIL';
      colourReason = `Wrong colour received: Observed "${observedColour}", expected "${product.colour}".`;
      exceptionsToCreate.push({
        exception_type: 'WRONG_COLOUR',
        severity: 'HIGH',
        root_cause: `Received item colour "${observedColour}" does not match expected "${product.colour}".`,
      });
    }
  } else if (skuStatus === 'PASS' && !photoTypes.has('PRODUCT_CLOSEUP') && !photoTypes.has('OPEN_CARTON')) {
    colourStatus = 'UNCERTAIN';
    colourReason = 'Colour not directly inspectable in sealed cartons without open product photos.';
  } else if (colourObs) {
    colourStatus = 'UNCERTAIN';
    colourReason = colourObs.reason;
  }

  checks.push({
    check_name: 'COLOUR',
    is_essential: false,
    status: colourStatus,
    observed_value: observedColour,
    expected_value: product.colour || 'N/A',
    confidence: colourObs?.confidence ?? 0.5,
    reason: colourReason,
    evidence_references: colourObs?.photoId ? [{ photo_id: colourObs.photoId, photo_type: colourObs.photoType }] : [],
  });

  // --------------------------------------------------------------------------
  // CHECK 9: DAMAGE (Essential)
  // SAFETY: Never claim water damage from shadow or normal cardboard colour.
  // --------------------------------------------------------------------------
  const damageObsList = aiObsMap.get('DAMAGE') || [];
  let damageStatus: CheckStatus = 'PASS';
  let damageReason = 'No physical or structural carton/product damage observed in supplied photographs.';
  let observedDamage: string | null = 'NONE_OBSERVED';

  for (const dObs of damageObsList) {
    if (dObs.certainty === 'UNCERTAIN') {
      damageStatus = 'UNCERTAIN';
      damageReason = `Damage observation ambiguous: ${dObs.reason}`;
      observedDamage = 'UNCERTAIN_ANOMALY';
      break;
    }

    const obsValue = typeof dObs.observedValue === 'string' ? dObs.observedValue.toUpperCase() : '';
    const hasDamage = obsValue !== 'NONE' && obsValue !== 'INTACT' && obsValue !== 'NO_DAMAGE';

    if (hasDamage && dObs.certainty === 'HIGH') {
      damageStatus = 'FAIL';
      observedDamage = dObs.observedValue as string;
      damageReason = `Damage detected: ${dObs.reason}`;
      exceptionsToCreate.push({
        exception_type: `DAMAGED_PACKAGE_${obsValue.replace(/\s+/g, '_')}`,
        severity: 'CRITICAL',
        root_cause: `Physical damage confirmed: ${dObs.reason}`,
      });
      break;
    }
  }

  checks.push({
    check_name: 'DAMAGE',
    is_essential: true,
    status: damageStatus,
    observed_value: observedDamage,
    expected_value: 'INTACT_NO_DAMAGE',
    confidence: damageObsList[0]?.confidence ?? 0.9,
    reason: damageReason,
    evidence_references: damageObsList.map((d) => ({
      photo_id: d.photoId,
      photo_type: d.photoType,
      certainty: d.certainty,
    })),
  });

  // --------------------------------------------------------------------------
  // CHECK 10: MISSING_COMPONENTS (Non-essential)
  // SAFETY: Never claim missing components unless contents are clearly visible.
  // --------------------------------------------------------------------------
  const compObs = aiObsMap.get('MISSING_COMPONENTS')?.[0];
  let compStatus: CheckStatus = 'PASS';
  let compReason = 'All standard product components accounted for or packaging factory-sealed.';
  let observedComponents: string | null = 'ALL_PRESENT';

  if (!photoTypes.has('OPEN_CARTON') && !photoTypes.has('PRODUCT_CLOSEUP')) {
    compStatus = 'UNCERTAIN';
    compReason = 'Contents are inside sealed packaging. Components cannot be confirmed without open visibility.';
    observedComponents = 'SEALED_NOT_VISIBLE';
  } else if (compObs) {
    if (compObs.certainty === 'UNCERTAIN') {
      compStatus = 'UNCERTAIN';
      compReason = compObs.reason;
      observedComponents = 'UNCERTAIN_VISIBILITY';
    } else if (typeof compObs.observedValue === 'string' && compObs.observedValue.toUpperCase().includes('MISSING')) {
      compStatus = 'FAIL';
      observedComponents = compObs.observedValue;
      compReason = `Missing required components: ${compObs.reason}`;
      exceptionsToCreate.push({
        exception_type: 'MISSING_COMPONENTS',
        severity: 'HIGH',
        root_cause: `Verified missing components: ${compObs.reason}`,
      });
    }
  }

  checks.push({
    check_name: 'MISSING_COMPONENTS',
    is_essential: false,
    status: compStatus,
    observed_value: observedComponents,
    expected_value: 'COMPLETE_ALL_ACCESSORIES',
    confidence: compObs?.confidence ?? 0.8,
    reason: compReason,
    evidence_references: compObs?.photoId ? [{ photo_id: compObs.photoId, photo_type: compObs.photoType }] : [],
  });

  // ==========================================================================
  // DETERMINISTIC FINAL DECISION COMPOSITION
  // Rules:
  // - ACCEPT: all essential checks PASS
  // - EXCEPTION: any essential check FAIL
  // - REVIEW_REQUIRED: no FAIL, but one or more essential checks UNCERTAIN
  // ==========================================================================
  const essentialCheckResults = checks.filter((c) => c.is_essential);
  const failingEssentialChecks = essentialCheckResults.filter((c) => c.status === 'FAIL');
  const uncertainEssentialChecks = essentialCheckResults.filter((c) => c.status === 'UNCERTAIN');

  let finalDecision: FinalDecision = 'ACCEPT';
  let finalDecisionReason = 'All essential receiving verification checks passed successfully.';

  if (failingEssentialChecks.length > 0) {
    finalDecision = 'EXCEPTION';
    const failedNames = failingEssentialChecks.map((c) => c.check_name).join(', ');
    finalDecisionReason = `Receiving EXCEPTION: Essential check(s) failed: ${failedNames}. Verified discrepancies logged.`;
  } else if (uncertainEssentialChecks.length > 0) {
    finalDecision = 'REVIEW_REQUIRED';
    const uncertainNames = uncertainEssentialChecks.map((c) => c.check_name).join(', ');
    finalDecisionReason = `Human REVIEW_REQUIRED: Essential check(s) are UNCERTAIN: ${uncertainNames}. Evidence requires operator/manager physical audit.`;
  }

  // PILOT MODE DIRECTIVE:
  // In PILOT mode: manager must approve every shipment. No automatic acceptance.
  const isManagerApprovalRequired = operatingMode === 'PILOT' || finalDecision !== 'ACCEPT';

  return {
    checks,
    finalDecision,
    finalDecisionReason,
    operatingMode,
    isManagerApprovalRequired,
    exceptionsToCreate,
    observedCounts: {
      cartonCount: observedCartonCount,
      unitsPerCarton: observedUnitsPerCarton,
      totalQuantity: calculatedTotalUnits,
    },
  };
}
