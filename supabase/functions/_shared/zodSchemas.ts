import { z } from 'zod';

export const PhotoTypeEnum = z.enum([
  'CARTON_LABEL',
  'SEALED_CARTON',
  'OPEN_CARTON',
  'PRODUCT_CLOSEUP',
  'DAMAGE_DETAIL',
  'PACKING_SLIP',
  'SURROUNDING_CONTEXT',
]);

export const CheckNameEnum = z.enum([
  'SKU_IDENTITY',
  'BARCODE_MATCH',
  'CARTON_COUNT',
  'UNITS_PER_CARTON',
  'TOTAL_QUANTITY',
  'VARIANT',
  'COLOUR',
  'DAMAGE',
  'MISSING_COMPONENTS',
  'PHOTO_COMPLETENESS',
]);

export const CheckStatusEnum = z.enum(['PASS', 'FAIL', 'UNCERTAIN']);

export const OperatingModeEnum = z.enum(['PILOT', 'AUTOMATED']);

export const ReviewDecisionEnum = z.enum([
  'ACCEPT',
  'EXCEPTION',
  'REJECT_SHIPMENT',
  'REQUEST_REINSPECTION',
]);

export const ReviewModeEnum = z.enum([
  'PILOT_APPROVAL',
  'EXCEPTION_RESOLUTION',
  'MANAGER_OVERRIDE',
]);

// --------------------------------------------------------------------------
// Gemini Structured Output Schema
// --------------------------------------------------------------------------
export const AIObservationSchema = z.object({
  checkName: CheckNameEnum,
  observedValue: z.unknown().describe('The observed entity, e.g. text read, count, or condition'),
  certainty: z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNCERTAIN']),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1, 'Reason must be provided citing specific visible evidence'),
  photoId: z.string().optional(),
  photoType: PhotoTypeEnum.optional(),
  boundingBox: z.object({
    ymin: z.number().min(0).max(1000),
    xmin: z.number().min(0).max(1000),
    ymax: z.number().min(0).max(1000),
    xmax: z.number().min(0).max(1000),
  }).optional(),
});

export const GeminiInspectionAnalysisSchema = z.object({
  observations: z.array(AIObservationSchema),
  rawTextNotes: z.string().optional(),
});

// --------------------------------------------------------------------------
// Edge Function Input Schemas
// --------------------------------------------------------------------------

export const CreateInspectionInputSchema = z.object({
  po_id: z.string().uuid(),
  po_line_id: z.string().uuid().optional(),
  carton_count_observed: z.number().int().positive().optional(),
  units_per_carton_observed: z.number().int().positive().optional(),
});

export const UploadEvidenceMetadataInputSchema = z.object({
  inspection_id: z.string().uuid(),
  storage_path: z.string().min(3),
  bucket_name: z.string().default('inspection-evidence'),
  photo_type: PhotoTypeEnum,
  sha256_hash: z.string().regex(/^[a-f0-9]{64}$/i, 'Must be a valid 64-character SHA-256 hex string'),
  file_size_bytes: z.number().int().positive(),
  mime_type: z.string().regex(/^image\/(jpeg|png|webp|heic)$/i),
  captured_at: z.string().datetime().optional(),
});

export const BarcodeScanInputSchema = z.object({
  raw_scan_value: z.string().min(1),
  symbology: z.string().default('EAN_13'),
  is_gtin_valid: z.boolean().optional(),
  zxing_metadata: z.record(z.string(), z.unknown()).optional(),
});

export const AnalyzeInspectionInputSchema = z.object({
  inspection_id: z.string().uuid(),
  barcode_scans: z.array(BarcodeScanInputSchema).min(1, 'At least one barcode scan is required'),
  manual_carton_count: z.number().int().positive().optional(),
  idempotency_key: z.string().min(8, 'Idempotency key required').optional(),
});

export const CreateSignedEvidenceUrlInputSchema = z.object({
  storage_path: z.string().min(3),
  bucket_name: z.string().default('inspection-evidence'),
  expires_in_seconds: z.number().int().min(60).max(86400).default(3600),
});

export const ImportProductsInputSchema = z.object({
  products: z.array(
    z.object({
      sku: z.string().min(2),
      barcode_gtin: z.string().min(8),
      name: z.string().min(2),
      description: z.string().optional(),
      variant: z.string().optional(),
      colour: z.string().optional(),
      units_per_carton: z.number().int().positive(),
      dimensions_cm: z.object({
        length: z.number().positive(),
        width: z.number().positive(),
        height: z.number().positive(),
      }).optional(),
      weight_kg: z.number().positive().optional(),
      reference_image_url: z.string().optional(),
    })
  ).min(1),
});

export const ImportPurchaseOrdersInputSchema = z.object({
  purchase_orders: z.array(
    z.object({
      po_number: z.string().min(2),
      supplier_code: z.string().min(2),
      expected_delivery_date: z.string().optional(),
      notes: z.string().optional(),
      lines: z.array(
        z.object({
          sku: z.string().min(2),
          expected_cartons: z.number().int().positive(),
          units_per_carton: z.number().int().positive(),
          expected_total_units: z.number().int().positive(),
        })
      ).min(1),
    })
  ).min(1),
});

export const ManagerReviewInspectionInputSchema = z.object({
  inspection_id: z.string().uuid(),
  review_decision: ReviewDecisionEnum,
  review_mode: ReviewModeEnum,
  comments: z.string().min(5, 'Review comments must explain manager justification'),
});

export const ExportInspectionReportInputSchema = z.object({
  inspection_id: z.string().uuid(),
  format: z.enum(['json', 'markdown']).default('json'),
});
