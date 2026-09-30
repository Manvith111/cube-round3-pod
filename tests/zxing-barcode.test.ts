import {
  calculateGtinCheckDigit,
  isValidGtin,
  normalizeToGtin14,
  parseZXingBarcode,
} from '../supabase/functions/_shared/zxingBarcode.ts';

export function runBarcodeTests(): { passed: number; failed: number; results: { name: string; ok: boolean; message: string }[] } {
  const testResults: { name: string; ok: boolean; message: string }[] = [];

  function assert(name: string, condition: boolean, failMsg: string) {
    testResults.push({
      name,
      ok: condition,
      message: condition ? 'Passed' : failMsg,
    });
  }

  // GTIN-13 check digit test
  // 8901234567890 -> digits without check: 890123456789
  const checkDigit1 = calculateGtinCheckDigit('890123456789');
  assert('GTIN-13 check digit calculation', checkDigit1 === 0, `Expected 0, got ${checkDigit1}`);

  // 8901234567891 -> digits without check: 890123456789
  // Wait, let's test valid GTIN
  assert('GTIN-13 validation for 8901234567890', isValidGtin('8901234567890'), 'Should be valid');
  assert('GTIN-13 rejection of invalid check digit', !isValidGtin('8901234567895'), 'Should be invalid');

  // UPC-A (12 digits): 012345678905
  // 0*3 + 1*1 + 2*3 + 3*1 + 4*3 + 5*1 + 6*3 + 7*1 + 8*3 + 9*1 + 0*3 = 0+1+6+3+12+5+18+7+24+9+0 = 85. 10 - (85%10) = 5.
  assert('GTIN-12 (UPC-A) check digit calculation', calculateGtinCheckDigit('01234567890') === 5, 'UPC check digit must be 5');
  assert('GTIN-12 validation', isValidGtin('012345678905'), 'Should be valid');

  // Normalization to GTIN-14
  assert('Normalization of GTIN-13 to 14', normalizeToGtin14('8901234567890') === '08901234567890', 'Should pad 1 zero');

  // ZXing scanner parsing
  const zxingResult = parseZXingBarcode('8901234567890', 'EAN_13', { scanTimeMs: 14 });
  assert('ZXing parser sets valid GTIN', zxingResult.isValidGtin === true, 'Must flag valid GTIN');
  assert('ZXing parser captures symbology', zxingResult.symbology === 'EAN_13', 'Must preserve symbology');

  const passed = testResults.filter((r) => r.ok).length;
  const failed = testResults.filter((r) => !r.ok).length;
  return { passed, failed, results: testResults };
}
