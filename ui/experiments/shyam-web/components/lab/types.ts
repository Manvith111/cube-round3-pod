/** Shapes of what the pod backend returns (ui/runner.py: describe, ui/server.py: meta, case). Only fields the lab reads. */

export interface Meta {
  stages: string[];
  orgs: string[];
  agents: Record<string, { agent_id?: string; mode?: string; implementation?: string } | null>;
  naming: Record<string, { rule: string; roles: { role: string; label: string; prefix: string }[] }>;
  image_exts: string[];
  input_root: string;
}

export interface CaptureFile {
  ref: string;
  kind?: string;
  sha256: string;
}

export interface CaseInfo {
  case: { org_id: string; unit_id: string; route: string; returned: boolean };
  returns_pairs: number[];
  captures: Record<string, { folder: string; orchestrator_would_send: CaptureFile[] }>;
}

export interface SavedCapture {
  source: string;
  status: 'saved' | 'already_present';
  name: string;
  original_unchanged?: boolean;
}

export interface CaptureResult {
  saved: SavedCapture[];
  errors: { source: string; error: string }[];
}

export interface StageCheck {
  check_key: string;
  verdict: string;
  detail?: string;
  observed?: unknown;
  uncertain_reason?: string;
  confidence?: number;
}

export interface StageSource {
  name: string;
  kind: 'model' | 'replay' | 'no_call' | 'none' | string;
  banner: string | null;
  calls?: number | null;
  cost_usd?: number | null;
  version?: string | null;
  provider?: string | null;
  agent_json: { implementation?: string };
}

export interface StageView {
  stage: string;
  state: string;
  skipped_reason: string | null;
  record_id: string | null;
  agent_id: string | null;
  verdict: string | null;
  outcome: string | null;
  needs_human: boolean | null;
  stage_error: { code: string; message: string; retryable?: boolean } | null;
  next_step_recommendation: string | null;
  decision: { outcome?: string; reason?: string; confidence?: number; needs_human?: boolean } | null;
  output_confidence: number | null;
  checks: StageCheck[];
  source: StageSource | null;
  client_calls: {
    client: string;
    returned_output: boolean;
    exception: { type: string; message: string } | null;
    previous_evidence_ids: string[];
  }[];
  duration_ms?: number | null;
  folder_files: { name: string; ref: string; sha256: string; in_inputs_sent: boolean }[];
  inputs_sent: { ref: string; sha256?: string | null }[];
  evidence_inputs: { ref: string; sha256?: string | null }[];
  evidence_refs: { ref: string; points_to: string; cited_by: string[] }[];
  agent_output_schema_errors: string[] | null;
  evidence_schema_errors: string[] | null;
  raw: { agent_input: unknown; agent_output: unknown; evidence_record: any };
}

export interface RunView {
  run_id: string;
  elapsed_ms: number;
  request: { mode: 'single' | 'full'; stage: string; org_id: string; unit_id: string; test: string | null; pair: number | null };
  label: string;
  custom?: boolean;
  notes: string[];
  case: { org_id: string; unit_id: string; route: string; returned: boolean };
  test: {
    name: string;
    what_ran: string;
    expected: string;
    observed_error_codes: (string | null)[];
    refusal_recorded?: boolean;
  } | null;
  workflow: {
    workflow_id: string;
    status: string;
    status_reason: string;
    final_outcome: {
      outcome: string;
      verdict: string;
      reason: string;
      claimable_usd?: number | null;
      effective_verdicts: Record<string, string>;
    } | null;
    halted: unknown;
    errors: { stage: string; code: string; message: string }[];
    overrides: {
      override_id: string;
      supersedes: { record_id: string };
      previous_verdict: string;
      new_verdict: string;
      actor: string;
      reason: string;
    }[];
    transitions: { at: string; event: string; stage: string | null; detail: string | null }[];
  };
  workflow_schema_errors: string[];
  stages: StageView[];
  raw: { workflow_state: unknown };
}
