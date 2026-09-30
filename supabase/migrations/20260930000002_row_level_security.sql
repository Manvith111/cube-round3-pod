-- ============================================================================
-- DOCKPROOF AI WAREHOUSE RECEIVING MANAGER: ROW LEVEL SECURITY (RLS) POLICIES
-- Migration: 20260930000002_row_level_security.sql
-- Description: Strict role-based policies for operators, managers, and service role
-- ============================================================================

-- ============================================================================
-- SECURITY DEFINER HELPER FUNCTIONS
-- ============================================================================

-- Function to get the role of the current authenticated user
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

-- Helper to check if current user is a manager
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (get_user_role() = 'RECEIVING_MANAGER'::user_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper to check if current user is an operator
CREATE OR REPLACE FUNCTION is_operator()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (get_user_role() = 'RECEIVING_OPERATOR'::user_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper to check if caller is the Supabase service_role
CREATE OR REPLACE FUNCTION is_service_role()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================

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

-- ============================================================================
-- 1. PROFILES POLICIES
-- ============================================================================

CREATE POLICY "profiles_select_policy"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() OR is_manager() OR is_service_role()
  );

CREATE POLICY "profiles_update_policy"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    (id = auth.uid() AND NOT is_manager()) OR is_manager() OR is_service_role()
  )
  WITH CHECK (
    -- Operators cannot elevate their own role to MANAGER
    (id = auth.uid() AND role = (SELECT role FROM profiles WHERE id = auth.uid()))
    OR is_manager()
    OR is_service_role()
  );

CREATE POLICY "profiles_service_role_all"
  ON profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 2. SUPPLIERS POLICIES
-- ============================================================================

CREATE POLICY "suppliers_select_authenticated"
  ON suppliers FOR SELECT
  TO authenticated
  USING (is_active = true OR is_manager() OR is_service_role());

CREATE POLICY "suppliers_insert_manager"
  ON suppliers FOR INSERT
  TO authenticated
  WITH CHECK (is_manager() OR is_service_role());

CREATE POLICY "suppliers_update_manager"
  ON suppliers FOR UPDATE
  TO authenticated
  USING (is_manager() OR is_service_role())
  WITH CHECK (is_manager() OR is_service_role());

CREATE POLICY "suppliers_delete_manager"
  ON suppliers FOR DELETE
  TO authenticated
  USING (is_manager() OR is_service_role());

-- ============================================================================
-- 3. PRODUCTS POLICIES
-- ============================================================================

CREATE POLICY "products_select_authenticated"
  ON products FOR SELECT
  TO authenticated
  USING (is_active = true OR is_manager() OR is_service_role());

CREATE POLICY "products_insert_manager"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (is_manager() OR is_service_role());

CREATE POLICY "products_update_manager"
  ON products FOR UPDATE
  TO authenticated
  USING (is_manager() OR is_service_role())
  WITH CHECK (is_manager() OR is_service_role());

CREATE POLICY "products_delete_manager"
  ON products FOR DELETE
  TO authenticated
  USING (is_manager() OR is_service_role());

-- ============================================================================
-- 4. PURCHASE ORDERS & LINES POLICIES
-- ============================================================================

CREATE POLICY "po_select_authenticated"
  ON purchase_orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "po_write_manager"
  ON purchase_orders FOR ALL
  TO authenticated
  USING (is_manager() OR is_service_role())
  WITH CHECK (is_manager() OR is_service_role());

CREATE POLICY "po_lines_select_authenticated"
  ON purchase_order_lines FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "po_lines_write_manager"
  ON purchase_order_lines FOR ALL
  TO authenticated
  USING (is_manager() OR is_service_role())
  WITH CHECK (is_manager() OR is_service_role());

-- ============================================================================
-- 5. INSPECTIONS POLICIES
-- ============================================================================

-- Operators can see only their own inspections; Managers can see all
CREATE POLICY "inspections_select_policy"
  ON inspections FOR SELECT
  TO authenticated
  USING (
    operator_id = auth.uid() OR is_manager() OR is_service_role()
  );

-- Operators can create inspections assigned to themselves
CREATE POLICY "inspections_insert_policy"
  ON inspections FOR INSERT
  TO authenticated
  WITH CHECK (
    (operator_id = auth.uid() AND is_operator()) OR is_manager() OR is_service_role()
  );

-- Operators can only update in-progress metadata for their own inspection
-- Managers or service role can update decision/status
CREATE POLICY "inspections_update_policy"
  ON inspections FOR UPDATE
  TO authenticated
  USING (
    (operator_id = auth.uid() AND status = 'IN_PROGRESS') OR is_manager() OR is_service_role()
  )
  WITH CHECK (
    -- Operators cannot arbitrarily change final decision to ACCEPT or OVERRIDDEN
    (
      operator_id = auth.uid()
      AND status IN ('IN_PROGRESS', 'ANALYZING')
      AND final_decision IS NULL
    )
    OR is_manager()
    OR is_service_role()
  );

-- Deletion of inspections is prohibited for operators to preserve audit trail
CREATE POLICY "inspections_delete_prohibited_operators"
  ON inspections FOR DELETE
  TO authenticated
  USING (is_service_role());

-- ============================================================================
-- 6. BARCODE SCANS POLICIES
-- ============================================================================

CREATE POLICY "scans_select_policy"
  ON barcode_scans FOR SELECT
  TO authenticated
  USING (
    scanned_by = auth.uid() OR is_manager() OR is_service_role()
  );

CREATE POLICY "scans_insert_policy"
  ON barcode_scans FOR INSERT
  TO authenticated
  WITH CHECK (
    scanned_by = auth.uid() OR is_manager() OR is_service_role()
  );

-- Modifying or deleting raw barcode scans is prohibited
CREATE POLICY "scans_no_update"
  ON barcode_scans FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "scans_no_delete"
  ON barcode_scans FOR DELETE
  TO authenticated
  USING (is_service_role());

-- ============================================================================
-- 7. INSPECTION PHOTOS (IMMUTABLE ORIGINAL EVIDENCE)
-- ============================================================================

-- Operators can view photos of their own inspections; managers can view all
CREATE POLICY "photos_select_policy"
  ON inspection_photos FOR SELECT
  TO authenticated
  USING (
    operator_id = auth.uid() OR is_manager() OR is_service_role()
  );

-- Operators can add photos to their own active inspections
CREATE POLICY "photos_insert_policy"
  ON inspection_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    (operator_id = auth.uid() AND EXISTS (
      SELECT 1 FROM inspections
      WHERE inspections.id = inspection_photos.inspection_id
      AND inspections.operator_id = auth.uid()
    ))
    OR is_manager()
    OR is_service_role()
  );

-- CRITICAL: Modifying photo metadata or deleting photos is strictly prohibited
CREATE POLICY "photos_no_update"
  ON inspection_photos FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "photos_no_delete"
  ON inspection_photos FOR DELETE
  TO authenticated
  USING (is_service_role());

-- ============================================================================
-- 8. INSPECTION CHECKS & AI OBSERVATIONS POLICIES
-- (Only Edge Functions / Service Role can create or modify)
-- ============================================================================

CREATE POLICY "checks_select_policy"
  ON inspection_checks FOR SELECT
  TO authenticated
  USING (
    is_manager()
    OR EXISTS (
      SELECT 1 FROM inspections
      WHERE inspections.id = inspection_checks.inspection_id
      AND inspections.operator_id = auth.uid()
    )
    OR is_service_role()
  );

-- Only Edge Function / service role can insert/update checks
CREATE POLICY "checks_service_role_write"
  ON inspection_checks FOR ALL
  TO authenticated
  USING (is_service_role())
  WITH CHECK (is_service_role());

CREATE POLICY "ai_obs_select_policy"
  ON ai_observations FOR SELECT
  TO authenticated
  USING (
    is_manager()
    OR EXISTS (
      SELECT 1 FROM inspections
      WHERE inspections.id = ai_observations.inspection_id
      AND inspections.operator_id = auth.uid()
    )
    OR is_service_role()
  );

CREATE POLICY "ai_obs_service_role_write"
  ON ai_observations FOR ALL
  TO authenticated
  USING (is_service_role())
  WITH CHECK (is_service_role());

-- ============================================================================
-- 9. EXCEPTIONS POLICIES
-- ============================================================================

CREATE POLICY "exceptions_select_policy"
  ON exceptions FOR SELECT
  TO authenticated
  USING (
    is_manager()
    OR EXISTS (
      SELECT 1 FROM inspections
      WHERE inspections.id = exceptions.inspection_id
      AND inspections.operator_id = auth.uid()
    )
    OR is_service_role()
  );

-- Service role creates exceptions automatically; Managers can also log manual exceptions
CREATE POLICY "exceptions_insert_policy"
  ON exceptions FOR INSERT
  TO authenticated
  WITH CHECK (is_manager() OR is_service_role());

-- Only managers can update exceptions (resolve, override notes, root cause)
CREATE POLICY "exceptions_update_manager"
  ON exceptions FOR UPDATE
  TO authenticated
  USING (is_manager() OR is_service_role())
  WITH CHECK (is_manager() OR is_service_role());

-- Exceptions cannot be deleted
CREATE POLICY "exceptions_no_delete"
  ON exceptions FOR DELETE
  TO authenticated
  USING (is_service_role());

-- ============================================================================
-- 10. INSPECTION REVIEWS POLICIES
-- ============================================================================

CREATE POLICY "reviews_select_policy"
  ON inspection_reviews FOR SELECT
  TO authenticated
  USING (
    is_manager()
    OR EXISTS (
      SELECT 1 FROM inspections
      WHERE inspections.id = inspection_reviews.inspection_id
      AND inspections.operator_id = auth.uid()
    )
    OR is_service_role()
  );

-- Only managers can create review decisions
CREATE POLICY "reviews_insert_manager"
  ON inspection_reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    (reviewer_id = auth.uid() AND is_manager()) OR is_service_role()
  );

CREATE POLICY "reviews_no_update"
  ON inspection_reviews FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "reviews_no_delete"
  ON inspection_reviews FOR DELETE
  TO authenticated
  USING (is_service_role());

-- ============================================================================
-- 11. AUDIT LOGS POLICIES (Immutable Ledger)
-- ============================================================================

CREATE POLICY "audit_select_policy"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    is_manager() OR actor_id = auth.uid() OR is_service_role()
  );

CREATE POLICY "audit_insert_policy"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id = auth.uid() OR is_service_role()
  );

CREATE POLICY "audit_no_update"
  ON audit_logs FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "audit_no_delete"
  ON audit_logs FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================================
-- 12. APPLICATION SETTINGS POLICIES
-- ============================================================================

CREATE POLICY "settings_select_policy"
  ON application_settings FOR SELECT
  TO authenticated
  USING (true);

-- Only managers can change application settings (e.g. PILOT vs AUTOMATED)
CREATE POLICY "settings_write_manager"
  ON application_settings FOR ALL
  TO authenticated
  USING (is_manager() OR is_service_role())
  WITH CHECK (is_manager() OR is_service_role());

-- ============================================================================
-- 13. IDEMPOTENCY KEYS POLICIES
-- ============================================================================

CREATE POLICY "idempotency_select_policy"
  ON idempotency_keys FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_service_role());

CREATE POLICY "idempotency_insert_policy"
  ON idempotency_keys FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR is_service_role());

CREATE POLICY "idempotency_update_policy"
  ON idempotency_keys FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR is_service_role())
  WITH CHECK (user_id = auth.uid() OR is_service_role());
