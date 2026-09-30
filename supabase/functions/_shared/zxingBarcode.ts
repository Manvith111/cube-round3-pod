/**
 * ZXing-compatible barcode parsing and GTIN verification utility.
 * Supports standard retail/warehouse symbologies: EAN-13, UPC-A, GTIN-14, Code 128, QR Code.
 */

export interface ZXingScanResult {
  rawValue: string;
  normalizedGtin?: string;
  symbology: string;
  isValidGtin: boolean;
  gs1Prefix?: string;
  metadata: {
    length: number;
    hasValidCheckDigit: boolean;
    format: string;
    parsedAt: string;
  };
}

/**
 * Calculates GS1 Modulo-10 check digit for standard GTINs (GTIN-8, 12, 13, 14)
 */
export function calculateGtinCheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  const len = digitsWithoutCheck.length;
  // Weight alternates: rightmost digit before check has weight 3, next 1, next 3...
  let weight = 3;
  for (let i = len - 1; i >= 0; i--) {
    const d = parseInt(digitsWithoutCheck[i], 10);
    sum += d * weight;
    weight = weight === 3 ? 1 : 3;
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

/**
 * Validates whether a barcode string is a valid GTIN-8, GTIN-12, GTIN-13, or GTIN-14
 */
export function isValidGtin(gtinString: string): boolean {
  const clean = gtinString.trim();
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(clean)) {
    return false;
  }
  const body = clean.slice(0, -1);
  const providedCheck = parseInt(clean.slice(-1), 10);
  const calculatedCheck = calculateGtinCheckDigit(body);
  return providedCheck === calculatedCheck;
}

/**
 * Normalizes any valid GTIN (8, 12, 13) to GTIN-14 by left-padding with zeros
 */
export function normalizeToGtin14(barcode: string): string {
  const clean = barcode.trim();
  if (/^\d{8,14}$/.test(clean)) {
    return clean.padStart(14, '0');
  }
  return clean;
}

/**
 * Parses raw barcode scan data compatible with ZXing scanner outputs
 */
export function parseZXingBarcode(
  rawValue: string,
  providedSymbology = 'EAN_13',
  extraMetadata: Record<string, unknown> = {}
): ZXingScanResult {
  const clean = rawValue.trim();
  const isGtin = isValidGtin(clean);
  const format = isGtin
    ? clean.length === 8
      ? 'GTIN-8'
      : clean.length === 12
      ? 'GTIN-12 (UPC-A)'
      : clean.length === 13
      ? 'GTIN-13 (EAN-13)'
      : 'GTIN-14'
    : providedSymbology || 'NON_GTIN_BARCODE';

  return {
    rawValue: clean,
    normalizedGtin: isGtin ? normalizeToGtin14(clean) : undefined,
    symbology: providedSymbology,
    isValidGtin: isGtin,
    gs1Prefix: isGtin && clean.length >= 3 ? clean.substring(0, 3) : undefined,
    metadata: {
      length: clean.length,
      hasValidCheckDigit: isGtin,
      format,
      parsedAt: new Date().toISOString(),
      ...extraMetadata,
    },
  };
}
