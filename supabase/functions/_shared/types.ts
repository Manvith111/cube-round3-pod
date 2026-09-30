/**
 * DockProof AI Core Type Definitions
 * Shared across Supabase Edge Functions, Rules Engine, and Verification Tests.
 */

export type UserRole = 'RECEIVING_OPERATOR' | 'RECEIVING_MANAGER';

export type POStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'EXCEPTION';

export type POLineStatus = 'PENDING' | 'PARTIAL' | 'COMPLETE' | 'DISCREPANCY';

export type InspectionStatus = 
  | 'IN_PROGRESS' 
  | 'ANALYZING' 
  | 'ACCEPT' 
  | 'EXCEPTION' 
  | 'REVIEW_REQUIRED' 
  | 'OVERRIDDEN';

export type OperatingMode = 'PILOT' | 'AUTOMATED';

export type CheckStatus = 'PASS' | 'FAIL' | 'UNCERTAIN';

export type PhotoType = 
  | 'CARTON_LABEL' 
  | 'SEALED_CARTON' 
  | 'OPEN_CARTON' 
  | 'PRODUCT_CLOSEUP' 
  | 'DAMAGE_DETAIL' 
  | 'PACKING_SLIP' 
  | 'SURROUNDING_CONTEXT';

export type CheckName = 
  | 'SKU_IDENTITY'
  | 'BARCODE_MATCH'
  | 'CARTON_COUNT'
  | 'UNITS_PER_CARTON'
  | 'TOTAL_QUANTITY'
  | 'VARIANT'
  | 'COLOUR'
  | 'DAMAGE'
  | 'MISSING_COMPONENTS'
  | 'PHOTO_COMPLETENESS';

export type ExceptionSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ExceptionStatus = 
  | 'OPEN' 
  | 'INVESTIGATING' 
  | 'APPROVED_OVERRIDE' 
  | 'REJECTED_SHIPMENT' 
  | 'RETURN_TO_VENDOR';

export type ReviewDecision = 'ACCEPT' | 'EXCEPTION' | 'REJECT_SHIPMENT' | 'REQUEST_REINSPECTION';

export type ReviewMode = 'PILOT_APPROVAL' | 'EXCEPTION_RESOLUTION' | 'MANAGER_OVERRIDE';

export type FinalDecision = 'ACCEPT' | 'EXCEPTION' | 'REVIEW_REQUIRED';

export interface UserProfile {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  badge_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_email?: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode_gtin: string;
  name: string;
  description?: string;
  variant?: string;
  colour?: string;
  units_per_carton: number;
  dimensions_cm?: { length: number; width: number; height: number };
  weight_kg?: number;
  reference_image_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  status: POStatus;
  expected_delivery_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  lines?: PurchaseOrderLine[];
  supplier?: Supplier;
}

export interface PurchaseOrderLine {
  id: string;
  purchase_order_id: string;
  product_id: string;
  expected_cartons: number;
  units_per_carton: number;
  expected_total_units: number;
  received_cartons: number;
  received_total_units: number;
  line_status: POLineStatus;
  product?: Product;
}

export interface BarcodeScanData {
  id?: string;
  inspection_id?: string;
  raw_scan_value: string;
  symbology: string; // e.g. 'EAN_13', 'CODE_128', 'QR_CODE'
  is_gtin_valid: boolean;
  zxing_metadata?: Record<string, unknown>;
  scanned_by?: string;
  scanned_at?: string;
}

export interface InspectionPhotoMetadata {
  id?: string;
  inspection_id: string;
  storage_path: string;
  bucket_name: string;
  photo_type: PhotoType;
  sha256_hash: string;
  file_size_bytes: number;
  mime_type: string;
  operator_id: string;
  captured_at: string;
  created_at?: string;
  signed_url?: string;
}

export interface AIObservation {
  id?: string;
  inspection_id?: string;
  checkName: CheckName;
  observedValue: unknown;
  certainty: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNCERTAIN';
  confidence: number;
  reason: string;
  photoId?: string;
  photoType?: PhotoType;
  boundingBox?: {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
  };
}

export interface GeminiAnalysisResponse {
  observations: AIObservation[];
  rawTextNotes?: string;
}

export interface InspectionCheckResult {
  id?: string;
  inspection_id?: string;
  check_name: CheckName;
  is_essential: boolean;
  status: CheckStatus;
  observed_value: unknown;
  expected_value: unknown;
  confidence: number;
  reason: string;
  evidence_references: {
    photo_id?: string;
    photo_type?: PhotoType;
    barcode?: string;
    certainty?: string;
  }[];
}

export interface RulesEngineInput {
  poLine: PurchaseOrderLine;
  product: Product;
  barcodeScans: BarcodeScanData[];
  photos: InspectionPhotoMetadata[];
  aiObservations: AIObservation[];
  operatingMode: OperatingMode;
  manualCartonCount?: number;
}

export interface RulesEngineOutput {
  checks: InspectionCheckResult[];
  finalDecision: FinalDecision;
  finalDecisionReason: string;
  operatingMode: OperatingMode;
  isManagerApprovalRequired: boolean;
  exceptionsToCreate: {
    exception_type: string;
    severity: ExceptionSeverity;
    root_cause: string;
  }[];
  observedCounts: {
    cartonCount: number | null;
    unitsPerCarton: number | null;
    totalQuantity: number | null;
  };
}

export interface InspectionReport {
  inspectionId: string;
  poNumber: string;
  sku: string;
  productName: string;
  operatorId: string;
  status: InspectionStatus;
  operatingMode: OperatingMode;
  finalDecision: FinalDecision;
  finalDecisionReason: string;
  isManagerApprovalRequired: boolean;
  observedCounts: {
    cartonCount: number | null;
    unitsPerCarton: number | null;
    totalQuantity: number | null;
  };
  checks: InspectionCheckResult[];
  exceptions: {
    type: string;
    severity: ExceptionSeverity;
    cause: string;
  }[];
  photoCount: number;
  scannedBarcodes: string[];
  createdAt: string;
  completedAt?: string;
}
