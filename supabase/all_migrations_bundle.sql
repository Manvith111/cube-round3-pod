-- ============================================================================
-- DOCKPROOF AI COMPLETE MIGRATION BUNDLE
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/aaqjekyrgboqhrlgcgqg/sql
-- Includes:
-- 1. Initial schema & 15 tables
-- 2. Row Level Security (RLS) & helper functions
-- 3. Storage buckets & access policies
-- 4. Seed products, suppliers, POs, scenarios, and default PILOT settings
-- ============================================================================

-- ============================================================================
-- PART 1: CORE EXTENSIONS & ENUMS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 2: TABLES
-- ============================================================================

-- 1. PROFILES
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

-- 3. PRODUCTS
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

-- 7. BARCODE SCANS
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

-- 8. INSPECTION PHOTOS
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

-- 9. INSPECTION CHECKS
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

-- 10. AI OBSERVATIONS
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

-- 11. EXCEPTIONS
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

-- 12. INSPECTION REVIEWS
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

-- 13. AUDIT LOGS
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

-- 14. APPLICATION SETTINGS
CREATE TABLE IF NOT EXISTS application_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. IDEMPOTENCY KEYS
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
-- PART 3: ROW LEVEL SECURITY & HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role
  FROM profiles
  WHERE id = auth.uid();
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (get_user_role() = 'RECEIVING_MANAGER'::user_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_operator()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (get_user_role() = 'RECEIVING_OPERATOR'::user_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_service_role()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE barcode_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
CREATE POLICY "profiles_select_policy" ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_manager() OR is_service_role());

DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
CREATE POLICY "profiles_update_policy" ON profiles FOR UPDATE TO authenticated
  USING ((id = auth.uid() AND NOT is_manager()) OR is_manager() OR is_service_role())
  WITH CHECK ((id = auth.uid() AND role = (SELECT role FROM profiles WHERE id = auth.uid())) OR is_manager() OR is_service_role());

DROP POLICY IF EXISTS "profiles_service_role_all" ON profiles;
CREATE POLICY "profiles_service_role_all" ON profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Suppliers Policies
DROP POLICY IF EXISTS "suppliers_select_authenticated" ON suppliers;
CREATE POLICY "suppliers_select_authenticated" ON suppliers FOR SELECT TO authenticated
  USING (is_active = true OR is_manager() OR is_service_role());

DROP POLICY IF EXISTS "suppliers_write_manager" ON suppliers;
CREATE POLICY "suppliers_write_manager" ON suppliers FOR ALL TO authenticated
  USING (is_manager() OR is_service_role()) WITH CHECK (is_manager() OR is_service_role());

-- Products Policies
DROP POLICY IF EXISTS "products_select_authenticated" ON products;
CREATE POLICY "products_select_authenticated" ON products FOR SELECT TO authenticated
  USING (is_active = true OR is_manager() OR is_service_role());

DROP POLICY IF EXISTS "products_write_manager" ON products;
CREATE POLICY "products_write_manager" ON products FOR ALL TO authenticated
  USING (is_manager() OR is_service_role()) WITH CHECK (is_manager() OR is_service_role());

-- Purchase Orders & Lines Policies
DROP POLICY IF EXISTS "po_select_authenticated" ON purchase_orders;
CREATE POLICY "po_select_authenticated" ON purchase_orders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "po_write_manager" ON purchase_orders;
CREATE POLICY "po_write_manager" ON purchase_orders FOR ALL TO authenticated
  USING (is_manager() OR is_service_role()) WITH CHECK (is_manager() OR is_service_role());

DROP POLICY IF EXISTS "po_lines_select_authenticated" ON purchase_order_lines;
CREATE POLICY "po_lines_select_authenticated" ON purchase_order_lines FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "po_lines_write_manager" ON purchase_order_lines;
CREATE POLICY "po_lines_write_manager" ON purchase_order_lines FOR ALL TO authenticated
  USING (is_manager() OR is_service_role()) WITH CHECK (is_manager() OR is_service_role());

-- Inspections Policies
DROP POLICY IF EXISTS "inspections_select_policy" ON inspections;
CREATE POLICY "inspections_select_policy" ON inspections FOR SELECT TO authenticated
  USING (operator_id = auth.uid() OR is_manager() OR is_service_role());

DROP POLICY IF EXISTS "inspections_insert_policy" ON inspections;
CREATE POLICY "inspections_insert_policy" ON inspections FOR INSERT TO authenticated
  WITH CHECK ((operator_id = auth.uid() AND is_operator()) OR is_manager() OR is_service_role());

DROP POLICY IF EXISTS "inspections_update_policy" ON inspections;
CREATE POLICY "inspections_update_policy" ON inspections FOR UPDATE TO authenticated
  USING ((operator_id = auth.uid() AND status = 'IN_PROGRESS') OR is_manager() OR is_service_role())
  WITH CHECK ((operator_id = auth.uid() AND status IN ('IN_PROGRESS', 'ANALYZING') AND final_decision IS NULL) OR is_manager() OR is_service_role());

DROP POLICY IF EXISTS "inspections_delete_prohibited_operators" ON inspections;
CREATE POLICY "inspections_delete_prohibited_operators" ON inspections FOR DELETE TO authenticated USING (is_service_role());

-- Barcode Scans Policies
DROP POLICY IF EXISTS "scans_select_policy" ON barcode_scans;
CREATE POLICY "scans_select_policy" ON barcode_scans FOR SELECT TO authenticated
  USING (scanned_by = auth.uid() OR is_manager() OR is_service_role());

DROP POLICY IF EXISTS "scans_insert_policy" ON barcode_scans;
CREATE POLICY "scans_insert_policy" ON barcode_scans FOR INSERT TO authenticated
  WITH CHECK (scanned_by = auth.uid() OR is_manager() OR is_service_role());

DROP POLICY IF EXISTS "scans_no_update" ON barcode_scans;
CREATE POLICY "scans_no_update" ON barcode_scans FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "scans_no_delete" ON barcode_scans;
CREATE POLICY "scans_no_delete" ON barcode_scans FOR DELETE TO authenticated USING (is_service_role());

-- Photos Policies
DROP POLICY IF EXISTS "photos_select_policy" ON inspection_photos;
CREATE POLICY "photos_select_policy" ON inspection_photos FOR SELECT TO authenticated
  USING (operator_id = auth.uid() OR is_manager() OR is_service_role());

DROP POLICY IF EXISTS "photos_insert_policy" ON inspection_photos;
CREATE POLICY "photos_insert_policy" ON inspection_photos FOR INSERT TO authenticated
  WITH CHECK ((operator_id = auth.uid() AND EXISTS (SELECT 1 FROM inspections WHERE inspections.id = inspection_photos.inspection_id AND inspections.operator_id = auth.uid())) OR is_manager() OR is_service_role());

DROP POLICY IF EXISTS "photos_no_update" ON inspection_photos;
CREATE POLICY "photos_no_update" ON inspection_photos FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "photos_no_delete" ON inspection_photos;
CREATE POLICY "photos_no_delete" ON inspection_photos FOR DELETE TO authenticated USING (is_service_role());

-- Checks & AI Observations (Service Role Only Writes)
DROP POLICY IF EXISTS "checks_select_policy" ON inspection_checks;
CREATE POLICY "checks_select_policy" ON inspection_checks FOR SELECT TO authenticated
  USING (is_manager() OR EXISTS (SELECT 1 FROM inspections WHERE inspections.id = inspection_checks.inspection_id AND inspections.operator_id = auth.uid()) OR is_service_role());

DROP POLICY IF EXISTS "checks_service_role_write" ON inspection_checks;
CREATE POLICY "checks_service_role_write" ON inspection_checks FOR ALL TO authenticated
  USING (is_service_role()) WITH CHECK (is_service_role());

DROP POLICY IF EXISTS "ai_obs_select_policy" ON ai_observations;
CREATE POLICY "ai_obs_select_policy" ON ai_observations FOR SELECT TO authenticated
  USING (is_manager() OR EXISTS (SELECT 1 FROM inspections WHERE inspections.id = ai_observations.inspection_id AND inspections.operator_id = auth.uid()) OR is_service_role());

DROP POLICY IF EXISTS "ai_obs_service_role_write" ON ai_observations;
CREATE POLICY "ai_obs_service_role_write" ON ai_observations FOR ALL TO authenticated
  USING (is_service_role()) WITH CHECK (is_service_role());

-- Exceptions Policies
DROP POLICY IF EXISTS "exceptions_select_policy" ON exceptions;
CREATE POLICY "exceptions_select_policy" ON exceptions FOR SELECT TO authenticated
  USING (is_manager() OR EXISTS (SELECT 1 FROM inspections WHERE inspections.id = exceptions.inspection_id AND inspections.operator_id = auth.uid()) OR is_service_role());

DROP POLICY IF EXISTS "exceptions_insert_policy" ON exceptions;
CREATE POLICY "exceptions_insert_policy" ON exceptions FOR INSERT TO authenticated WITH CHECK (is_manager() OR is_service_role());

DROP POLICY IF EXISTS "exceptions_update_manager" ON exceptions;
CREATE POLICY "exceptions_update_manager" ON exceptions FOR UPDATE TO authenticated USING (is_manager() OR is_service_role()) WITH CHECK (is_manager() OR is_service_role());

DROP POLICY IF EXISTS "exceptions_no_delete" ON exceptions;
CREATE POLICY "exceptions_no_delete" ON exceptions FOR DELETE TO authenticated USING (is_service_role());

-- Reviews Policies
DROP POLICY IF EXISTS "reviews_select_policy" ON inspection_reviews;
CREATE POLICY "reviews_select_policy" ON inspection_reviews FOR SELECT TO authenticated
  USING (is_manager() OR EXISTS (SELECT 1 FROM inspections WHERE inspections.id = inspection_reviews.inspection_id AND inspections.operator_id = auth.uid()) OR is_service_role());

DROP POLICY IF EXISTS "reviews_insert_manager" ON inspection_reviews;
CREATE POLICY "reviews_insert_manager" ON inspection_reviews FOR INSERT TO authenticated
  WITH CHECK ((reviewer_id = auth.uid() AND is_manager()) OR is_service_role());

DROP POLICY IF EXISTS "reviews_no_update" ON inspection_reviews;
CREATE POLICY "reviews_no_update" ON inspection_reviews FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "reviews_no_delete" ON inspection_reviews;
CREATE POLICY "reviews_no_delete" ON inspection_reviews FOR DELETE TO authenticated USING (is_service_role());

-- Audit Logs Policies
DROP POLICY IF EXISTS "audit_select_policy" ON audit_logs;
CREATE POLICY "audit_select_policy" ON audit_logs FOR SELECT TO authenticated USING (is_manager() OR actor_id = auth.uid() OR is_service_role());

DROP POLICY IF EXISTS "audit_insert_policy" ON audit_logs;
CREATE POLICY "audit_insert_policy" ON audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid() OR is_service_role());

DROP POLICY IF EXISTS "audit_no_update" ON audit_logs;
CREATE POLICY "audit_no_update" ON audit_logs FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "audit_no_delete" ON audit_logs;
CREATE POLICY "audit_no_delete" ON audit_logs FOR DELETE TO authenticated USING (false);

-- Application Settings Policies
DROP POLICY IF EXISTS "settings_select_policy" ON application_settings;
CREATE POLICY "settings_select_policy" ON application_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "settings_write_manager" ON application_settings;
CREATE POLICY "settings_write_manager" ON application_settings FOR ALL TO authenticated USING (is_manager() OR is_service_role()) WITH CHECK (is_manager() OR is_service_role());

-- Idempotency Keys Policies
DROP POLICY IF EXISTS "idempotency_select_policy" ON idempotency_keys;
CREATE POLICY "idempotency_select_policy" ON idempotency_keys FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_service_role());

DROP POLICY IF EXISTS "idempotency_insert_policy" ON idempotency_keys;
CREATE POLICY "idempotency_insert_policy" ON idempotency_keys FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR is_service_role());

DROP POLICY IF EXISTS "idempotency_update_policy" ON idempotency_keys;
CREATE POLICY "idempotency_update_policy" ON idempotency_keys FOR UPDATE TO authenticated USING (user_id = auth.uid() OR is_service_role()) WITH CHECK (user_id = auth.uid() OR is_service_role());

-- ============================================================================
-- PART 4: PRIVATE STORAGE BUCKETS & STORAGE POLICIES
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('inspection-evidence', 'inspection-evidence', false, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('inspection-analysis', 'inspection-analysis', false, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('product-reference-images', 'product-reference-images', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- PART 5: SYSTEM APPLICATION SETTINGS (NO DUMMY PRODUCTS OR POs)
-- ============================================================================

INSERT INTO application_settings (key, value, description)
VALUES 
  (
    'operating_mode',
    '{"mode": "PILOT", "requireManagerApprovalForAccept": true, "autoAcceptAllowed": false}'::jsonb,
    'Warehouse operating mode. In PILOT mode, manager review is mandatory for all final decisions.'
  ),
  (
    'required_photo_types',
    '["BARCODE_LABEL", "CARTON_FRONT", "CARTON_LEFT", "CARTON_RIGHT", "CARTON_TOP", "SHIPMENT_OVERVIEW"]'::jsonb,
    'Mandatory photo perspectives required before AI inspection can be triggered.'
  ),
  (
    'rules_thresholds',
    '{"minConfidence": 0.85, "damageTolerance": "ZERO", "allowBoxCountMismatch": false}'::jsonb,
    'Quality and decision thresholds for deterministic receiving rules engine.'
  )
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;
