-- ============================================================================
-- DOCKPROOF AI WAREHOUSE RECEIVING MANAGER: INITIAL SCHEMA MIGRATION
-- Migration: 20260930000001_initial_schema.sql
-- Description: Core tables, enums, triggers, and relational constraints
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('RECEIVING_OPERATOR', 'RECEIVING_MANAGER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE po_status AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'EXCEPTION');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE po_line_status AS ENUM ('PENDING', 'PARTIAL', 'COMPLETE', 'DISCREPANCY');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE inspection_status AS ENUM ('IN_PROGRESS', 'ANALYZING', 'ACCEPT', 'EXCEPTION', 'REVIEW_REQUIRED', 'OVERRIDDEN');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE operating_mode AS ENUM ('PILOT', 'AUTOMATED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE check_status AS ENUM ('PASS', 'FAIL', 'UNCERTAIN');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE photo_type AS ENUM (
    'CARTON_LABEL',
    'SEALED_CARTON',
    'OPEN_CARTON',
    'PRODUCT_CLOSEUP',
    'DAMAGE_DETAIL',
    'PACKING_SLIP',
    'SURROUNDING_CONTEXT'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE exception_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE exception_status AS ENUM (
    'OPEN',
    'INVESTIGATING',
    'APPROVED_OVERRIDE',
    'REJECTED_SHIPMENT',
    'RETURN_TO_VENDOR'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE review_decision AS ENUM (
    'ACCEPT',
    'EXCEPTION',
    'REJECT_SHIPMENT',
    'REQUEST_REINSPECTION'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE review_mode AS ENUM (
    'PILOT_APPROVAL',
    'EXCEPTION_RESOLUTION',
    'MANAGER_OVERRIDE'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- COMMON FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLES DEFINITION
-- ============================================================================

-- 1. PROFILES (Extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'RECEIVING_OPERATOR',
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  badge_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();

-- 2. SUPPLIERS
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  contact_email TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();

-- 3. PRODUCTS (Product Catalogue)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  barcode_gtin TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  variant TEXT,
  colour TEXT,
  units_per_carton INTEGER NOT NULL CHECK (units_per_carton > 0),
  dimensions_cm JSONB,
  weight_kg NUMERIC(10,3),
  reference_image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();

-- 4. PURCHASE ORDERS
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  status po_status NOT NULL DEFAULT 'ISSUED',
  expected_delivery_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();

-- 5. PURCHASE ORDER LINES
CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  expected_cartons INTEGER NOT NULL CHECK (expected_cartons >= 0),
  units_per_carton INTEGER NOT NULL CHECK (units_per_carton > 0),
  expected_total_units INTEGER NOT NULL CHECK (expected_total_units >= 0),
  received_cartons INTEGER NOT NULL DEFAULT 0 CHECK (received_cartons >= 0),
  received_total_units INTEGER NOT NULL DEFAULT 0 CHECK (received_total_units >= 0),
  line_status po_line_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_po_line_product UNIQUE (purchase_order_id, product_id)
);

CREATE TRIGGER trg_po_lines_updated_at
  BEFORE UPDATE ON purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();

-- 6. INSPECTIONS
CREATE TABLE IF NOT EXISTS inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  po_line_id UUID REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
  operator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  status inspection_status NOT NULL DEFAULT 'IN_PROGRESS',
  mode operating_mode NOT NULL DEFAULT 'PILOT',
  carton_count_observed INTEGER,
  units_per_carton_observed INTEGER,
  total_quantity_observed INTEGER,
  final_decision TEXT CHECK (final_decision IN ('ACCEPT', 'EXCEPTION', 'REVIEW_REQUIRED')),
  final_decision_reason TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_inspections_updated_at
  BEFORE UPDATE ON inspections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();

-- 7. BARCODE SCANS (ZXing integration)
CREATE TABLE IF NOT EXISTS barcode_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  raw_scan_value TEXT NOT NULL,
  symbology TEXT NOT NULL DEFAULT 'EAN_13',
  is_gtin_valid BOOLEAN NOT NULL DEFAULT false,
  zxing_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  scanned_by UUID NOT NULL REFERENCES profiles(id),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. INSPECTION PHOTOS (Immutable original evidence)
CREATE TABLE IF NOT EXISTS inspection_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  bucket_name TEXT NOT NULL DEFAULT 'inspection-evidence',
  photo_type photo_type NOT NULL,
  sha256_hash TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  operator_id UUID NOT NULL REFERENCES profiles(id),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_inspection_photo_hash UNIQUE (inspection_id, sha256_hash)
);

-- 9. INSPECTION CHECKS (Deterministic verification engine outputs)
CREATE TABLE IF NOT EXISTS inspection_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  check_name TEXT NOT NULL,
  is_essential BOOLEAN NOT NULL DEFAULT false,
  status check_status NOT NULL,
  observed_value JSONB,
  expected_value JSONB,
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reason TEXT NOT NULL,
  evidence_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_inspection_check_name UNIQUE (inspection_id, check_name)
);

-- 10. AI OBSERVATIONS (Strict JSON evidence from Gemini vision)
CREATE TABLE IF NOT EXISTS ai_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  raw_ai_response JSONB NOT NULL,
  check_name TEXT NOT NULL,
  observed_value JSONB,
  certainty TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL,
  reason TEXT NOT NULL,
  photo_id UUID REFERENCES inspection_photos(id) ON DELETE SET NULL,
  photo_type TEXT,
  bounding_box JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. EXCEPTIONS (Logged when verified FAIL or discrepancy occurs)
CREATE TABLE IF NOT EXISTS exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  exception_type TEXT NOT NULL,
  severity exception_severity NOT NULL DEFAULT 'HIGH',
  status exception_status NOT NULL DEFAULT 'OPEN',
  root_cause TEXT,
  manager_notes TEXT,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_exceptions_updated_at
  BEFORE UPDATE ON exceptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();

-- 12. INSPECTION REVIEWS (Manager approvals, exception resolutions, overrides)
CREATE TABLE IF NOT EXISTS inspection_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  original_decision TEXT NOT NULL,
  review_decision review_decision NOT NULL,
  review_mode review_mode NOT NULL,
  comments TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. AUDIT LOGS (Immutable append-only ledger)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role TEXT,
  ip_address TEXT,
  user_agent TEXT,
  previous_state JSONB,
  new_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. APPLICATION SETTINGS (Global modes and threshold configs)
CREATE TABLE IF NOT EXISTS application_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_application_settings_updated_at
  BEFORE UPDATE ON application_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();

-- 15. IDEMPOTENCY KEYS (Prevents duplicate API/Edge Function execution)
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE AND INTEGRITY
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_po_lines_po_id ON purchase_order_lines(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_lines_product_id ON purchase_order_lines(product_id);
CREATE INDEX IF NOT EXISTS idx_inspections_po_id ON inspections(po_id);
CREATE INDEX IF NOT EXISTS idx_inspections_operator_id ON inspections(operator_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status);
CREATE INDEX IF NOT EXISTS idx_barcode_scans_inspection ON barcode_scans(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_photos_inspection ON inspection_photos(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_checks_inspection ON inspection_checks(inspection_id);
CREATE INDEX IF NOT EXISTS idx_ai_observations_inspection ON ai_observations(inspection_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_inspection ON exceptions(inspection_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_po ON exceptions(po_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_status ON exceptions(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
