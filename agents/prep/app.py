"""Prep Manager — agent entry point (Round 3 contract adapter).

Ported from the Round 2 OpsConsole Prep Manager. The design is unchanged:
**AI observes, rules decide.** Gemini (vision.py) only describes what is visible; the
deterministic engine here (`evaluate`) turns observations into PASS / FAIL / UNCERTAIN
by fixed logic, citing an exact rule clause per check (rules.py). Same observations in,
same verdicts out.

Contract: reads an Agent Input, runs ONE batched model call per unit, returns an Agent
Output whose Evidence Record is built with shared.utils.records. Fails open: any model
error yields UNCERTAIN checks (never an invented verdict), and an unexpected crash yields
a pending record via make_app. Tenancy: the record is bound to request.subject.org_id and
never mixes subjects.

Run:  uvicorn agents.prep.app:app --port 8102
Provenance: see PROVENANCE.md.
"""
from __future__ import annotations

import base64
import os
import re
from pathlib import Path

from shared.utils.records import build_output, build_record, check
from shared.utils.server import make_app
from shared.utils.stubs import effective_verdict, previous

from .rules import CHECK_CATALOG, RULE_CLAUSES, RULE_PACK, default_product
from .vision import PROMPT_VERSION, observe

STAGE = "prep"
AGENT_ID = "prep-manager@3.0.0"  # the real ported agent, not the organiser stub
MAX_PHOTOS = 6
CONFIDENCE_RANK = {"low": 0, "medium": 1, "high": 2}
CONFIDENCE_SCORE = {"high": 0.9, "medium": 0.6, "low": 0.3}
ROOT = Path(__file__).resolve().parents[2]


# ----------------------------------------------------------------- tenancy
def _assert_tenant(request: dict) -> None:
    """Refuse a subject that is not known under this org (engineering rule 1).

    A real deployment checks its own per-org capture/catalog store. Here a subject is
    served only if, scoped to `org_id`, one of these exists: captures or a product.json
    under data/input/<subject>/prep, or a row in the agent's catalogue. Otherwise the
    request is for another tenant (or unknown) and must get nothing — never a cross-tenant
    answer. Raising LookupError becomes AgentRejected (in-proc) / HTTP 404 (served).
    """
    s = request["subject"]
    org, subject_id = s["org_id"], s["subject_id"]
    root = Path(os.environ.get("INPUT_DIR", ROOT / "data" / "input"))
    folder = root / subject_id / "prep"
    if folder.is_dir() and any(p.is_file() for p in folder.iterdir()):
        return  # captures present for this subject
    try:
        from shared.utils import sample_data
        if sample_data.has("prep", subject_id, org):
            return  # known under this org in the agent's catalogue
    except Exception:
        pass
    raise LookupError(f"prep: no subject {subject_id!r} under org {org!r}")


# ----------------------------------------------------------------- inputs
def _load_photos(inputs: list[dict]) -> list[dict]:
    """Read image bytes for the content-addressed inputs the orchestrator discovered.

    Files live under INPUT_DIR (default data/input); `ref` is relative to that root.
    Missing bytes are skipped silently — the engine then treats the check as UNCERTAIN.
    """
    root = Path(os.environ.get("INPUT_DIR", ROOT / "data" / "input"))
    out: list[dict] = []
    for item in inputs:
        if item.get("kind") not in (None, "image"):
            continue
        p = root / item["ref"]
        if not p.is_file():
            continue
        suffix = p.suffix.lower()
        media = {".png": "image/png", ".webp": "image/webp", ".heic": "image/heic"}.get(suffix, "image/jpeg")
        out.append({"ref": item["ref"], "media_type": media,
                    "data_base64": base64.b64encode(p.read_bytes()).decode("ascii")})
    return out[:MAX_PHOTOS]


def _resolve_product(request: dict) -> dict:
    """Product config decides which checks apply. Precedence: a product.json beside the
    captures, then fields on the case context, then a conservative default."""
    subject = request["subject"]
    root = Path(os.environ.get("INPUT_DIR", ROOT / "data" / "input"))
    pfile = root / subject["subject_id"] / "prep" / "product.json"
    if pfile.is_file():
        import json
        data = json.loads(pfile.read_text())
        return {**default_product(), **data}
    case = request.get("context", {}).get("case", {})
    sku = case.get("sku") or subject.get("refs", {}).get("sku") or ""
    fnsku = case.get("fnsku") or case.get("expected_fnsku") or ""
    prod = default_product(sku=sku, expected_fnsku=fnsku)
    for k in ("requires_polybag", "has_expiry", "is_fragile", "cover_original_barcode",
              "required_handling_marks", "name", "category"):
        if k in case:
            prod[k] = case[k]
    return prod


# ----------------------------------------------------------------- deterministic engine
def _norm_fnsku(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", s or "").upper()


def _score(conf: str | None) -> float | None:
    return CONFIDENCE_SCORE.get(conf) if conf else None


def _uncertain(check_id, conf, observed, refs, reason):
    c = CHECK_CATALOG  # noqa: F841 (keeps import used if trimmed)
    return check(check_id, "UNCERTAIN", _score(conf), observed=observed, detail=observed,
                 evidence_refs=refs, uncertain_reason=reason)


def evaluate(product: dict, vision: dict, refs: list[str]) -> list[dict]:
    """Observations -> contract checks. Only applicable+verifiable checks are emitted
    (NOT_APPLICABLE / NOT_VERIFIABLE are not contract verdicts; they are summarised in payload)."""
    usable = {q["photo_index"]: q["usable"] for q in vision.get("photo_quality", [])}
    obs_by = {o["check_id"]: o for o in vision.get("observations", [])}
    available = vision.get("available", False)
    checks: list[dict] = []

    for d in CHECK_CATALOG:
        if not d.applies_to(product) or not d.verifiable:
            continue  # NOT_APPLICABLE / NOT_VERIFIABLE -> not an envelope verdict

        # FNSKU text match — derived from the transcribed label, not a direct observation.
        if d.id == "fnsku_text_match":
            if not available:
                checks.append(_uncertain(d.id, None, "AI observation unavailable — re-run the inspection.",
                                         refs, "model_error"))
                continue
            lr = vision["label_read"]
            if not lr.get("legible") or not lr.get("value"):
                checks.append(_uncertain(d.id, lr.get("confidence"),
                                         f"Label text could not be read (expected {product['expected_fnsku']}).",
                                         refs, "poor_image"))
                continue
            if CONFIDENCE_RANK.get(lr.get("confidence", "low"), 0) < 1:
                checks.append(_uncertain(d.id, lr.get("confidence"),
                                         f'Read "{lr["value"]}" with low confidence; expected '
                                         f'{product["expected_fnsku"]}.', refs, "insufficient_evidence"))
                continue
            match = _norm_fnsku(lr["value"]) == _norm_fnsku(product["expected_fnsku"])
            verdict = "PASS" if match else "FAIL"
            observed = (f'Label reads "{lr["value"]}", matching expected {product["expected_fnsku"]}.' if match
                        else f'Label reads "{lr["value"]}" but expected {product["expected_fnsku"]} — mismatch.')
            checks.append(check(d.id, verdict, _score(lr.get("confidence")), expected=product["expected_fnsku"],
                                observed=observed, detail=observed, evidence_refs=refs))
            continue

        # Standard observation-driven checks.
        if not available:
            checks.append(_uncertain(d.id, None, "AI observation unavailable — re-run the inspection.",
                                     refs, "model_error"))
            continue
        obs = obs_by.get(d.id)
        if not obs:
            checks.append(_uncertain(d.id, None, "No observation was returned for this check.",
                                     refs, "insufficient_evidence"))
            continue
        pi = obs.get("photo_index")
        if pi is not None and usable.get(pi) is False:
            checks.append(_uncertain(d.id, obs.get("confidence"),
                                     f"Photo {pi} not usable — {obs.get('evidence') or 'retake needed'}.",
                                     refs, "poor_image"))
            continue
        if obs.get("status") == "cant_tell":
            checks.append(_uncertain(d.id, obs.get("confidence"),
                                     obs.get("evidence") or "Not determinable from the photos provided.",
                                     refs, "occluded"))
            continue
        if not (obs.get("evidence") or "").strip():
            checks.append(_uncertain(d.id, obs.get("confidence"),
                                     "No visible evidence was cited — treated as uncertain.",
                                     refs, "insufficient_evidence"))
            continue
        if CONFIDENCE_RANK.get(obs.get("confidence", "low"), 0) < 1:
            checks.append(_uncertain(d.id, obs.get("confidence"),
                                     f"Low-confidence observation: {obs['evidence']}", refs,
                                     "insufficient_evidence"))
            continue
        verdict = "PASS" if obs["status"] == "met" else "FAIL"
        checks.append(check(d.id, verdict, _score(obs.get("confidence")), expected=d.expected,
                            observed=obs["evidence"], detail=obs["evidence"], evidence_refs=refs))
    return checks


def _overall(checks: list[dict]) -> tuple[str, str]:
    fails = [c for c in checks if c["verdict"] == "FAIL"]
    uncertains = [c for c in checks if c["verdict"] == "UNCERTAIN"]
    if fails:
        return "FAIL", f"FAIL — {fails[0]['check_key']}: {fails[0].get('observed', '')}"
    if uncertains or not checks:
        n = len(uncertains)
        return "UNCERTAIN", (f"UNCERTAIN — {n} required check(s) could not be confirmed." if n
                             else "UNCERTAIN — no applicable checks could be evaluated.")
    return "PASS", "PASS — every required check passed with cited visual evidence."


# ----------------------------------------------------------------- entry point
def handle(request: dict) -> dict:
    _assert_tenant(request)
    subject = request["subject"]
    product = _resolve_product(request)
    photos = _load_photos(request.get("inputs", []))
    refs = [p["ref"] for p in photos]

    vision = observe(product, photos, CHECK_CATALOG, RULE_CLAUSES)
    checks = evaluate(product, vision, refs)
    verdict, reason = _overall(checks)
    outcome = {"PASS": "compliant", "FAIL": "non_compliant", "UNCERTAIN": "pending_review"}[verdict]

    # Non-verifiable requirements are not dropped — they are surfaced for a human/manual step.
    manual = [d.id for d in CHECK_CATALOG if d.applies_to(product) and not d.verifiable]

    # Honour the latest override of our own previous evidence, if any (idempotent re-runs).
    prev = previous(request, STAGE)
    if prev:
        verdict = effective_verdict(request, prev) if prev else verdict

    model = {"name": vision["model"], "version": "1", "provider": ("google" if vision["available"] else None),
             "prompt_version": PROMPT_VERSION, "calls": vision["calls"], "cost_usd": None}

    record = build_record(
        request, agent_id=AGENT_ID,
        record_id=f"PRP-{re.sub(r'[^A-Za-z0-9._-]', '-', subject['subject_id'])}",
        captured_at=request.get("context", {}).get("case", {}).get("captured_at") or _now(),
        operator_id=request.get("context", {}).get("case", {}).get("operator_id"),
        refs={"sku": product.get("sku"), "fnsku": product.get("expected_fnsku"),
              "asin": request.get("context", {}).get("case", {}).get("asin"),
              "fba_shipment_id": request.get("context", {}).get("case", {}).get("fba_shipment_id")},
        checks=checks, outcome=outcome, verdict=verdict, model=model,
        inputs=[{"ref": p["ref"], "sha256": None, "kind": "image"} for p in photos],
        reason=reason,
        payload={
            # F-07: Recovery asked Prep for measured weight/dimensions. This agent is camera-only
            # and does not measure physically, so measurements are honestly null (see docs/decisions.md).
            "measurements": None,
            "rule_pack": RULE_PACK,
            "manual_checks_required": manual,
            "vision": {"model": vision["model"], "available": vision["available"], "note": vision.get("note")},
        },
    )
    return build_output(record)


def _now() -> str:
    from shared.utils.records import utcnow
    return utcnow()


app = make_app(STAGE, handle, version="3.0.0")
