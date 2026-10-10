-- ==============================================================================
-- CUBE POD 5-AGENT COMMERCE SYSTEM - SUPABASE DATABASE SCHEMA
-- Run this migration in Supabase SQL Editor (or Vercel Postgres)
-- ==============================================================================

-- 1. Create Storage Bucket for Verification Captures
INSERT INTO storage.buckets (id, name, public)
VALUES ('commerce-evidence-captures', 'commerce-evidence-captures', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policy: Allow public read access to evidence captures
CREATE POLICY "Public Access To Evidence Captures"
ON storage.objects FOR SELECT
USING (bucket_id = 'commerce-evidence-captures');

-- Storage Policy: Allow authenticated / service uploads
CREATE POLICY "Allow Uploads To Evidence Captures"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'commerce-evidence-captures');


-- 2. Workflows Table (Authoritative state and outcome)
CREATE TABLE IF NOT EXISTS workflows (
    workflow_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    route TEXT NOT NULL,
    returned BOOLEAN DEFAULT false,
    status TEXT NOT NULL,
    status_reason TEXT,
    final_outcome JSONB,
    transitions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_org_unit ON workflows(org_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at DESC);


-- 3. Evidence Records Table (Immutable content-addressed agent outputs)
CREATE TABLE IF NOT EXISTS evidence_records (
    record_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(workflow_id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    status TEXT NOT NULL,
    verdict TEXT NOT NULL,
    outcome TEXT NOT NULL,
    reason TEXT,
    content_hash TEXT NOT NULL,
    captured_at TIMESTAMPTZ,
    produced_at TIMESTAMPTZ DEFAULT NOW(),
    model_metadata JSONB,
    checks JSONB DEFAULT '[]'::jsonb,
    payload JSONB DEFAULT '{}'::jsonb,
    inputs JSONB DEFAULT '[]'::jsonb,
    upstream_refs TEXT[] DEFAULT ARRAY[]::TEXT[]
);

CREATE INDEX IF NOT EXISTS idx_evidence_workflow ON evidence_records(workflow_id);
CREATE INDEX IF NOT EXISTS idx_evidence_stage ON evidence_records(stage);
CREATE INDEX IF NOT EXISTS idx_evidence_org_subject ON evidence_records(org_id, subject_id);


-- 4. Captures Table (Uploaded & webcam photos linked to stage and unit)
CREATE TABLE IF NOT EXISTS captures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    file_size_bytes INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_captures_unit_stage ON captures(unit_id, stage);


-- 5. Execution History Audit Table (Full snapshot reports)
CREATE TABLE IF NOT EXISTS execution_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    route TEXT NOT NULL,
    status TEXT NOT NULL,
    final_outcome JSONB,
    stage_count INTEGER NOT NULL DEFAULT 0,
    full_report JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_history_created_at ON execution_history(created_at DESC);
