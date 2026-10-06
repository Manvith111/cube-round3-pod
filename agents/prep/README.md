# agents/prep/ · Prep Manager

**Owner:** @Manvith111 · **Agent:** `prep-manager@3.0.0` · **Mode:** in-process Python

The real Prep Manager, ported from the Round 2 OpsConsole agent (see [`PROVENANCE.md`](PROVENANCE.md)).
It is **not** the organiser stub.

## What it does

Checks an FBA unit is prepped correctly (poly-bag, suffocation warning, FNSKU label present/placed/correct,
original barcode covered, expiry visible, handling marks) so wrongly charged defect fees can be disputed.

Design — **AI observes, rules decide**:

1. **`vision.py`** sends ONE batched Gemini call per unit. Gemini only *describes* what is visible
   (`met` / `not_met` / `cant_tell` per check, a confidence, which photo + where, cited evidence, and a
   literal FNSKU transcription). It never emits a verdict.
2. **`evaluate()` in `app.py`** is the only place verdicts are produced — deterministically. Same
   observations in, same verdicts out. Unusable photo, `cant_tell`, no cited evidence, or low confidence
   all become **UNCERTAIN** (never a guessed PASS/FAIL).
3. **`rules.py`** holds the FBA v1 rule pack (clauses + checks) as data, so every check cites an exact
   clause and no rule is invented in code.

| | |
|---|---|
| **Reads (inputs)** | Photos of the prepped unit (content-addressed `inputs` from the orchestrator) |
| **Reads (previous evidence)** | Its own latest override, if any (idempotent re-runs) |
| **Produces** | Per-requirement `PASS/FAIL/UNCERTAIN` checks + an overall decision; `payload.rule_pack`, `payload.manual_checks_required`, `payload.measurements` |
| **`check_key`s** | `polybag_present, polybag_sealed, suffocation_warning_present, suffocation_warning_legible, fnsku_present, fnsku_placement, fnsku_text_match, original_barcode_covered, expiry_visible, handling_marks_present` |
| **`decision.outcome`** | `compliant, non_compliant, pending_review` |

## Configuration

| Env var | Purpose |
|---|---|
| `GEMINI_API_KEY` or `GOOGLE_API_KEY` | Google AI Studio key for live vision. **Without it the agent still runs** and returns honest UNCERTAIN records. |
| `PREP_MODEL` | Gemini model (default `gemini-2.5-flash`). |
| `INPUT_DIR` | Capture root (default `data/input`). Photos for a unit live in `data/input/<subject_id>/prep/`. |

Optional per-unit product config at `data/input/<subject_id>/prep/product.json` controls which checks apply
(`requires_polybag`, `has_expiry`, `is_fragile`, `cover_original_barcode`, `required_handling_marks`,
`sku`, `expected_fnsku`). Without it, a conservative FBA default is assumed.

## Run on its own

```sh
uvicorn agents.prep.app:app --port 8102
curl localhost:8102/health
```

Set `"mode": "http"` in `agent.json` to have the orchestrator call it over HTTP instead of in-process.

## Limits (honest)

- Camera-only: it does **not** measure weight or dimensions, so `payload.measurements` is `null` (finding F-07).
- The content hash on each record is a content hash, **not** tamper-evidence.
- `bag_thickness_material` cannot be judged from a photo; it is reported in `payload.manual_checks_required`, not as a verdict.
