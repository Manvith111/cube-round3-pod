/**
 * QR Code & 2D Barcode Payload Parser for Logistics and Complex Packaging Types.
 * Handles:
 * - JSON-encoded carton/pallet payloads (e.g. {"sku": "SKU-1002", "gtin": "084012345678", "po": "PO-1001", "qty": 24})
 * - GS1 Digital Link URLs (e.g. https://id.gs1.org/01/00840123456789/10/LOT456?sku=SKU-1002)
 * - Key-Value delimited strings (e.g. "SKU:SKU-1002|GTIN:084012345678|LOT:99")
 * - GS1 Application Identifier (AI) notation (e.g. (01)00840123456789(10)LOT456)
 * - Direct Plain SKU / GTIN values
 */

export interface ParsedQrPayload {
  raw: string;
  isStructured: boolean;
  formatType: 'JSON' | 'GS1_DIGITAL_LINK' | 'KEY_VALUE' | 'GS1_AI' | 'URL' | 'PLAIN';
  extractedSku?: string;
  extractedGtin?: string;
  extractedBatch?: string;
  extractedPo?: string;
  extractedQuantity?: number;
  metadata: Record<string, string | number>;
}

export function parseQrPayload(rawInput: string): ParsedQrPayload {
  const raw = rawInput.trim();
  const metadata: Record<string, string | number> = {};

  // 1. Try parsing JSON format
  if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        let extractedSku: string | undefined;
        let extractedGtin: string | undefined;
        let extractedBatch: string | undefined;
        let extractedPo: string | undefined;
        let extractedQuantity: number | undefined;

        for (const [key, val] of Object.entries(parsed)) {
          const lowerKey = key.toLowerCase();
          const strVal = String(val).trim();

          if (['sku', 'product_sku', 'item_code', 'item_sku', 'part_number'].includes(lowerKey)) {
            extractedSku = strVal.toUpperCase();
          } else if (['gtin', 'upc', 'ean', 'barcode', 'gtin14', 'gtin13'].includes(lowerKey)) {
            extractedGtin = strVal;
          } else if (['po', 'po_number', 'ponumber', 'purchase_order'].includes(lowerKey)) {
            extractedPo = strVal.toUpperCase();
          } else if (['batch', 'lot', 'batch_number', 'lot_number', 'serial'].includes(lowerKey)) {
            extractedBatch = strVal;
          } else if (['qty', 'quantity', 'carton_qty', 'units', 'expected_units'].includes(lowerKey)) {
            const num = Number(val);
            if (!isNaN(num)) extractedQuantity = num;
          }

          if (typeof val === 'string' || typeof val === 'number') {
            metadata[key] = val;
          }
        }

        return {
          raw,
          isStructured: true,
          formatType: 'JSON',
          extractedSku,
          extractedGtin,
          extractedBatch,
          extractedPo,
          extractedQuantity,
          metadata,
        };
      }
    } catch {
      // not valid JSON, proceed to other formats
    }
  }

  // 2. Try parsing URL / GS1 Digital Link
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const url = new URL(raw);
      let extractedSku: string | undefined;
      let extractedGtin: string | undefined;
      let extractedPo: string | undefined;
      let extractedBatch: string | undefined;

      // Check query params
      const searchParams = url.searchParams;
      for (const [key, val] of searchParams.entries()) {
        const lowerKey = key.toLowerCase();
        if (['sku', 'product_sku', 'item'].includes(lowerKey)) {
          extractedSku = val.trim().toUpperCase();
        } else if (['gtin', 'upc', 'ean', 'barcode'].includes(lowerKey)) {
          extractedGtin = val.trim();
        } else if (['po', 'po_number'].includes(lowerKey)) {
          extractedPo = val.trim().toUpperCase();
        } else if (['lot', 'batch', 'serial'].includes(lowerKey)) {
          extractedBatch = val.trim();
        }
        metadata[key] = val;
      }

      // Check GS1 Digital Link path structure: /01/<gtin>/10/<lot>/21/<serial>
      const pathSegments = url.pathname.split('/').filter(Boolean);
      for (let i = 0; i < pathSegments.length; i++) {
        const seg = pathSegments[i];
        if (seg === '01' && pathSegments[i + 1]) {
          extractedGtin = pathSegments[i + 1];
          metadata['GS1_GTIN_01'] = extractedGtin;
        } else if (seg === '10' && pathSegments[i + 1]) {
          extractedBatch = pathSegments[i + 1];
          metadata['GS1_LOT_10'] = extractedBatch;
        } else if (seg === '240' && pathSegments[i + 1]) {
          // Additional product identification (often SKU in GS1)
          extractedSku = pathSegments[i + 1].toUpperCase();
          metadata['GS1_SKU_240'] = extractedSku;
        }
      }

      const isGs1 = pathSegments.includes('01') || url.hostname.includes('gs1');

      return {
        raw,
        isStructured: true,
        formatType: isGs1 ? 'GS1_DIGITAL_LINK' : 'URL',
        extractedSku,
        extractedGtin,
        extractedBatch,
        extractedPo,
        metadata,
      };
    } catch {
      // not a standard URL, proceed
    }
  }

  // 3. Try parsing Delimited Key-Value strings (e.g. SKU:SKU-1002|GTIN:084012345678 or SKU=SKU-1002;LOT=88)
  if (
    (raw.includes(':') || raw.includes('=')) &&
    (raw.includes('|') || raw.includes(';') || raw.includes(','))
  ) {
    const delimiter = raw.includes('|') ? '|' : raw.includes(';') ? ';' : ',';
    const pairs = raw.split(delimiter);
    let extractedSku: string | undefined;
    let extractedGtin: string | undefined;
    let extractedBatch: string | undefined;
    let extractedPo: string | undefined;

    let matchedAnyPair = false;

    for (const pair of pairs) {
      const sep = pair.includes(':') ? ':' : '=';
      const [k, v] = pair.split(sep);
      if (k && v) {
        matchedAnyPair = true;
        const key = k.trim().toLowerCase();
        const val = v.trim();
        metadata[k.trim()] = val;

        if (['sku', 'product_sku', 'part'].includes(key)) {
          extractedSku = val.toUpperCase();
        } else if (['gtin', 'upc', 'ean', 'barcode'].includes(key)) {
          extractedGtin = val;
        } else if (['po', 'po_number'].includes(key)) {
          extractedPo = val.toUpperCase();
        } else if (['lot', 'batch', 'sn'].includes(key)) {
          extractedBatch = val;
        }
      }
    }

    if (matchedAnyPair && (extractedSku || extractedGtin)) {
      return {
        raw,
        isStructured: true,
        formatType: 'KEY_VALUE',
        extractedSku,
        extractedGtin,
        extractedBatch,
        extractedPo,
        metadata,
      };
    }
  }

  // 4. Try parsing GS1 Application Identifier parentheses format: e.g. (01)00840123456789(10)BATCH123
  if (raw.startsWith('(') && raw.includes(')')) {
    const aiRegex = /\((\d{2,4})\)([^(]+)/g;
    let match: RegExpExecArray | null;
    let extractedGtin: string | undefined;
    let extractedBatch: string | undefined;
    let extractedSku: string | undefined;
    let foundAi = false;

    while ((match = aiRegex.exec(raw)) !== null) {
      foundAi = true;
      const ai = match[1];
      const val = match[2].trim();
      metadata[`AI_${ai}`] = val;

      if (ai === '01') {
        extractedGtin = val;
      } else if (ai === '10') {
        extractedBatch = val;
      } else if (ai === '240') {
        extractedSku = val.toUpperCase();
      }
    }

    if (foundAi) {
      return {
        raw,
        isStructured: true,
        formatType: 'GS1_AI',
        extractedSku,
        extractedGtin,
        extractedBatch,
        metadata,
      };
    }
  }

  // 5. Default: Plain format (direct SKU or GTIN)
  const isPureNumeric = /^\d{8,14}$/.test(raw);

  return {
    raw,
    isStructured: false,
    formatType: 'PLAIN',
    extractedSku: !isPureNumeric ? raw.toUpperCase() : undefined,
    extractedGtin: isPureNumeric ? raw : undefined,
    metadata,
  };
}
