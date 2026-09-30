-- ============================================================================
-- DOCKPROOF AI: DEFAULT APPLICATION SETTINGS
-- Migration: 20260930000004_seed_data.sql
-- Description: Sets default system operating configuration without fake data.
-- NO DUMMY PRODUCTS, FAKE POs, OR SAMPLE SHIPMENTS ARE INCLUDED.
-- ============================================================================

INSERT INTO application_settings (key, value, description)
VALUES 
  (
    'operating_mode',
    '{
      "mode": "PILOT",
      "requireManagerApprovalForAccept": true,
      "autoAcceptAllowed": false
    }'::jsonb,
    'Warehouse operating mode. In PILOT mode, manager review is mandatory for all shipments.'
  ),
  (
    'required_photo_types',
    '[
      "BARCODE_LABEL",
      "CARTON_FRONT",
      "CARTON_LEFT",
      "CARTON_RIGHT",
      "CARTON_TOP",
      "SHIPMENT_OVERVIEW"
    ]'::jsonb,
    'Mandatory photo perspectives required before AI inspection can be triggered.'
  ),
  (
    'rules_thresholds',
    '{
      "minConfidence": 0.85,
      "damageTolerance": "ZERO",
      "allowBoxCountMismatch": false
    }'::jsonb,
    'Quality and decision thresholds for deterministic receiving rules engine.'
  )
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;
