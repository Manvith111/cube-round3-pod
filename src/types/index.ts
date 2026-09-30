export type UserRole = 'RECEIVING_OPERATOR' | 'RECEIVING_MANAGER';
export type OperatingMode = 'PILOT' | 'PRODUCTION';

export type POStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'PARTIALLY_RECEIVED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXCEPTION';

export type InspectionStatus =
  | 'IN_PROGRESS'
  | 'ACCEPT'
  | 'EXCEPTION'
  | 'REVIEW_REQUIRED';

export type CheckVerdict = 'PASS' | 'FAIL' | 'UNCERTAIN' | 'NOT_APPLICABLE';

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

export type PhotoType =
  | 'BARCODE_LABEL'
  | 'CARTON_FRONT'
  | 'CARTON_LEFT'
  | 'CARTON_RIGHT'
  | 'CARTON_TOP'
  | 'CARTON_BOTTOM'
  | 'SHIPMENT_OVERVIEW'
  | 'OPEN_CARTON'
  | 'PRODUCT'
  | 'COMPONENT_DETAIL'
  | 'DAMAGE_CLOSEUP';

export type PhotoQualityStatus =
  | 'PENDING'
  | 'GOOD'
  | 'BLURRY'
  | 'TOO_DARK'
  | 'OVEREXPOSED'
  | 'GLARE'
  | 'UNREADABLE_LABEL'
  | 'INCOMPLETE_VIEW'
  | 'DUPLICATE_SUSPECTED';

export type ExceptionSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type ExceptionStatus = 'OPEN' | 'QUARANTINED' | 'SUPPLIER_CLAIM' | 'RESOLVED';

export interface Supplier {
  id: string;
  supplier_code: string;
  supplier_name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  preferred_claim_process?: string;
  active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  sku: string;
  product_name: string;
  product_family?: string;
  gtin: string;
  barcodes?: string[];
  asin?: string;
  supplier_id?: string;
  variant?: string;
  colour?: string;
  expected_units_per_carton: number;
  required_components?: string[];
  description?: string;
  reference_image_paths?: string[];
  active: boolean;
  created_at: string;
}

export interface PurchaseOrderLine {
  id: string;
  purchase_order_id: string;
  sku: string;
  product_name: string;
  gtin: string;
  expected_units: number;
  expected_cartons: number;
  expected_units_per_carton: number;
  expected_variant?: string;
  expected_colour?: string;
  required_components?: string[];
  product_family?: string;
  is_manual?: boolean;
  created_at?: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_name?: string;
  expected_arrival_date?: string;
  status: POStatus;
  lines: PurchaseOrderLine[];
  created_at: string;
}

export interface BarcodeScan {
  id: string;
  inspection_id?: string;
  barcode_value: string;
  barcode_format: string;
  scan_source: 'CAMERA_SCAN' | 'MANUAL_ENTRY';
  matched_product_id?: string;
  matched_sku?: string;
  match_status: 'PASS' | 'FAIL' | 'UNCERTAIN';
  scanned_by?: string;
  manager_approved?: boolean;
  scanned_at: string;
}

export interface InspectionPhoto {
  id: string;
  inspection_id?: string;
  carton_id?: string;
  photo_type: PhotoType;
  original_storage_path?: string;
  analysis_storage_path?: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  sha256_hash: string;
  captured_at: string;
  uploaded_at?: string;
  operator_id?: string;
  quality_status: PhotoQualityStatus;
  quality_reason?: string;
  base64?: string; // in-memory preview
}

export interface InspectionCheck {
  id: string;
  inspection_id?: string;
  check_name: CheckName;
  expected_value: unknown;
  observed_value: unknown;
  verdict: CheckVerdict;
  confidence: number;
  reason: string;
  evidence?: {
    photoId?: string;
    photoType?: PhotoType;
    boundingBox?: { x: number; y: number; width: number; height: number };
  }[];
}

export interface ExceptionItem {
  id: string;
  inspection_id: string;
  purchase_order_id: string;
  po_number?: string;
  supplier_id?: string;
  supplier_name?: string;
  product_sku: string;
  carton_id?: string;
  severity: ExceptionSeverity;
  issue_type: string;
  status: ExceptionStatus;
  notes?: string;
  created_at: string;
  resolved_at?: string;
}

export interface Inspection {
  id: string;
  inspection_number: string;
  purchase_order_id: string;
  purchase_order_line_id?: string;
  po_number: string;
  supplier_id?: string;
  supplier_name?: string;
  product_sku: string;
  product_name: string;
  carton_id?: string;
  operator_id: string;
  operator_name?: string;
  status: InspectionStatus;
  mode: OperatingMode;
  overall_confidence: number;
  action_recommendation?: string;
  barcode_scans: BarcodeScan[];
  photos: InspectionPhoto[];
  checks: InspectionCheck[];
  exceptions: ExceptionItem[];
  observed_carton_count?: number;
  observed_units_per_carton?: number;
  observed_total_quantity?: number;
  manual_sku_verified?: boolean;
  manual_sku_verified_by?: string;
  manual_sku_verified_at?: string;
  manual_sku_notes?: string;
  created_at: string;
  completed_at?: string;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  previous_value?: unknown;
  new_value?: unknown;
  actor_name: string;
  actor_role: string;
  reason?: string;
  created_at: string;
}
