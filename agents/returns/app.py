"""Returns Manager: thin adapter between the Pod contract and the Round 2 RTN agent.

The Round 2 code (identity, completeness, Amazon-scale condition, disposition) lives untouched in `core/rtn/`.
This file only maps Agent Input -> that code -> Agent Output. Three paths, chosen by what the request carries:

  1. Photos AND a key  -> the REAL agent: one batched VLM call per unit, then Round 2's deterministic rules.
  2. Photos, but no key, or the model/any dependency fails -> a "pending" record (fail open). Never a silent replay.
  3. No photos at all (the sample units the contract tests use) -> a CSV REPLAY, labelled as such
     (model.name == "csv-replay", model.calls == 0). The replay copies the operator's disposition from the
     sample CSV. It is NOT this agent's judgment and must never be presented as one.

Tenancy: the unit must exist under subject.org_id in the Returns data, else LookupError (HTTP 404). Only files
under data/input/<subject_id>/ are ever read.

Captures use a filename convention: `reference_*` (catalogue photos) and `returned_*` (the returned item).

Environment (names only, see .env.example):  VLM_API_KEY  VLM_BASE_URL  VLM_MODEL  VLM_TIMEOUT_SECONDS
VLM_MAX_RETRIES  INPUT_DIR.  `openai`, `pydantic-settings`, `tenacity` and `python-dotenv` are imported lazily,
only on the real path, so the replay path (and `make test`) needs none of them.

Run over HTTP:  uvicorn agents.returns.app:app --port 8104
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import urlparse

from shared.utils import sample_data
from shared.utils.records import build_output, build_record, check, pending_output, rollup
from shared.utils.server import make_app
from shared.utils.stubs import effective_verdict, photos, previous, verdict_from

STAGE = "returns"
AGENT_ID = "returns-manager@1.0.0"
PROMPT_VERSION = "rtn-vlm.v1"

ROOT = Path(__file__).resolve().parents[2]
SCALE_DOC = Path(__file__).resolve().parent / "core" / "rtn" / "reference_data" / "amazon_condition_scale.json"
IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp")
REPLAY_MODEL = {"name": "csv-replay", "version": "0", "provider": None, "calls": 0, "cost_usd": 0}

_VERDICT = {"MATCH": "PASS", "NO_MATCH": "FAIL", "UNCERTAIN": "UNCERTAIN",
            "COMPLETE": "PASS", "INCOMPLETE": "FAIL"}


# ----------------------------------------------------------------------------------------------- inputs
def _input_root() -> Path:
    return Path(os.environ.get("INPUT_DIR", ROOT / "data" / "input"))


def _image_inputs(request: dict) -> list[dict]:
    return [i for i in request.get("inputs") or []
            if i.get("kind") == "image" or str(i.get("ref", "")).lower().endswith(IMAGE_EXTS)]


def _resolve(ref: str, subject_id: str) -> Path | None:
    """The file for an input ref, only if it sits under data/input/<subject_id>/. Never any other path."""
    parts = PurePosixPath(ref.replace("\\", "/")).parts
    if not parts or parts[0] != subject_id or ".." in parts:
        return None
    root = _input_root().resolve()
    path = (root / Path(*parts)).resolve()
    return path if path.is_relative_to(root) and path.is_file() else None


def _role(ref: str) -> str | None:
    name = PurePosixPath(ref.replace("\\", "/")).name.lower()
    return "reference" if name.startswith("reference") else "returned" if name.startswith("returned") else None


def _upstream(request: dict) -> list[dict]:
    """What earlier stages said, with the LATEST workflow override applied. Read-only."""
    return [{"record_id": r["record_id"], "stage": r["stage"], "effective_verdict": effective_verdict(request, r),
             "used_in_checks": []} for r in request.get("previous_evidence", [])]


# ----------------------------------------------------------------------------------------------- replay
def _replay(request: dict, row: dict) -> dict:
    """No photos: replay the sample CSV row, labelled. The disposition is the operator's, not this agent's."""
    refs = [p["ref"] for p in photos(row)]
    missing = [p for p in row["parts_missing"].split(";") if p]
    checks = [
        check("identity_match", verdict_from(row["identity_match"], {"yes"}, {"no"}), None,
              expected=row["ordered_sku"], observed=row["identity_match"], evidence_refs=refs,
              uncertain_reason="poor_image"),
        check("completeness", "FAIL" if missing else "PASS", None, expected=row["parts_list"].split(";"),
              observed={"missing": missing}, evidence_refs=refs),
    ]
    verdict = "FAIL" if any(c["verdict"] == "FAIL" for c in checks) else (
        "UNCERTAIN" if any(c["verdict"] == "UNCERTAIN" for c in checks)
        or row["operator_disposition"] == "pending_review" else "PASS")
    record = build_record(
        request, agent_id=AGENT_ID, record_id=row["record_id"], captured_at=row["captured_at"],
        operator_id=row["operator_id"],
        refs={"order_id": row["order_id"], "sku": row["ordered_sku"], "asin": row["ordered_asin"]},
        checks=checks, outcome=row["operator_disposition"], verdict=verdict, model=REPLAY_MODEL,
        inputs=photos(row),
        reason="csv-replay of the Round 2 sample row: the disposition is the operator's, copied. "
               "This is not a judgment by the Returns agent.",
        payload={"replay": True, "decided_by": "operator (copied from the sample CSV)", "observed_state": row["observed_state"],
                 "condition_graded": False, "amazon_condition": None, "parts_missing": missing,
                 "sent_contents_seen": previous(request, "pack") is not None,
                 "upstream_considered": _upstream(request)},
    )
    return build_output(record)


# ----------------------------------------------------------------------------------------------- real agent
class _NoStore:
    """The orchestrator owns evidence storage; Round 2's JSONL store is replaced by this no-op."""

    def write(self, record: Any) -> None:
        return None


def _load_env() -> None:
    try:
        from dotenv import load_dotenv  # lazy: python-dotenv is not in the Pod's requirements.txt
        load_dotenv(ROOT / ".env", override=False)
    except ImportError:
        pass


def _build_pipeline():
    """Lazy import so the replay path needs no extra packages. Tests replace this to fake the model."""
    from agents.returns.core.rtn.pipeline import RTNPipeline
    return RTNPipeline(store=_NoStore())


def _pending(request: dict, code: str, message: str) -> dict:
    return pending_output(request, code=code, message=message[:200], agent_id=AGENT_ID)


def _real(request: dict, row: dict, imgs: list[dict]) -> dict:
    """Photos present. Any failure becomes a pending record. Nothing here may raise to the orchestrator."""
    try:
        return _run_real(request, row, imgs)
    except Exception as exc:  # noqa: BLE001 - deliberate fail-open boundary (note: KeyError is a LookupError)
        return _pending(request, "model_error", f"{type(exc).__name__}: {exc}")


def _run_real(request: dict, row: dict, imgs: list[dict]) -> dict:
    s = request["subject"]
    _load_env()
    if not os.environ.get("VLM_API_KEY"):
        return _pending(request, "model_error", "photos were received but VLM_API_KEY is not set; no model call was made")

    found: dict[str, list[tuple[str, Path]]] = {"reference": [], "returned": []}
    for i in imgs:
        ref, path, role = str(i["ref"]), _resolve(str(i["ref"]), s["subject_id"]), _role(str(i["ref"]))
        if path is None:
            return _pending(request, "upstream_missing", f"capture {ref!r} is not readable under data/input/{s['subject_id']}/")
        if role is None:
            return _pending(request, "upstream_missing", f"capture {ref!r} is not named reference_* or returned_*")
        found[role].append((ref, path))
    if not found["reference"] or not found["returned"]:
        return _pending(request, "upstream_missing", "need at least one reference_* and one returned_* photo")

    from agents.returns.core.rtn.policy.completeness import gate_completeness
    from agents.returns.core.rtn.schemas.input import ExpectedComponent, ImageInput, OrderInfo, UnitInput
    from agents.returns.core.rtn.schemas.vlm_output import ComponentObservation

    image_inputs, ref_of = [], {}
    for role in ("reference", "returned"):
        for n, (ref, path) in enumerate(found[role], 1):
            image_id = f"{role}_{n}"
            ref_of[image_id] = ref
            image_inputs.append(ImageInput(image_id=image_id, role=role, path=str(path)))
    unit = UnitInput(
        subject=s["subject_id"], organization_id=s["org_id"], client_id=s["org_id"],
        captured_at=datetime.fromisoformat(row["captured_at"].replace("Z", "+00:00")),
        order=OrderInfo(sku=row["ordered_sku"], asin=row["ordered_asin"] or None, product_name=row["ordered_sku"]),
        expected_components=[ExpectedComponent(part_name=p.strip(), essential=True)
                             for p in row["parts_list"].split(";") if p.strip()],
        images=image_inputs)

    t0 = time.monotonic()
    rec = _build_pipeline().run_unit(unit)  # exactly one batched model call for the whole unit
    latency_ms = int((time.monotonic() - t0) * 1000)
    if rec.status.value == "PENDING":
        err = (rec.checks[0].raw_observation.get("error") if rec.checks else None) or "model call failed"
        return _pending(request, "model_error", str(err))

    c = {k.check_key.value: k for k in rec.checks}
    idc, comp, cond, pack = c["identity"], c["completeness"], c["condition"], c["packaging"]
    out = rec.outcome
    all_refs = [r for r, _ in found["reference"]] + [r for r, _ in found["returned"]]
    ret_refs = [r for r, _ in found["returned"]]

    # Completeness detail per part, via Round 2's own pure gate (no model call).
    gated = gate_completeness([ComponentObservation.model_validate(p) for p in comp.raw_observation.get("parts", [])])
    st = lambda want: [g.part_name for g in gated.parts if g.status.value == want]  # noqa: E731
    missing, not_seen, present = st("MISSING"), st("NOT_OBSERVED"), st("PRESENT")

    def poor(q: Any) -> bool:
        return getattr(q, "value", q) in ("POOR", "INSUFFICIENT")

    id_why = ("conflicting_evidence" if idc.fusion_signals.get("agreement_with_vlm") is False
              else "poor_image" if poor(idc.evidence_quality) else "insufficient_evidence")
    comp_why = "occluded" if not_seen else ("poor_image" if poor(comp.evidence_quality) else "insufficient_evidence")
    cond_why = "poor_image" if poor(cond.evidence_quality) else "insufficient_evidence"
    graded = cond.verdict != "UNDETERMINED"

    checks = [
        check("identity_match", _VERDICT.get(idc.verdict, "UNCERTAIN"), idc.confidence, expected=row["ordered_sku"],
              observed={"verdict": idc.verdict, "matching": idc.raw_observation.get("matching_attributes", []),
                        "conflicting": idc.raw_observation.get("conflicting_attributes", [])},
              detail=idc.detail, evidence_refs=all_refs, uncertain_reason=id_why),
        check("completeness", _VERDICT.get(comp.verdict, "UNCERTAIN"), comp.confidence,
              expected=[p for p in row["parts_list"].split(";") if p],
              observed={"missing": missing, "not_observed": not_seen, "present": present},
              detail=comp.detail, evidence_refs=ret_refs, uncertain_reason=comp_why),
        check("condition", "PASS" if graded else "UNCERTAIN", cond.confidence,
              expected="a grade on Amazon's published condition scale", observed={"amazon_condition": cond.verdict},
              detail=cond.detail, evidence_refs=ret_refs, uncertain_reason=cond_why),
    ]
    outcome = out.disposition.value.lower()
    verdict = rollup(checks)
    if outcome == "pending_review" and verdict == "PASS":
        verdict = "UNCERTAIN"  # a person is needed, so this can never read as a clean PASS
    scale = json.loads(SCALE_DOC.read_text(encoding="utf-8"))
    provider = urlparse(os.environ.get("VLM_BASE_URL", "https://api.groq.com/openai/v1")).hostname
    sha = {i.image_id: i.content_hash for i in rec.images}
    record = build_record(
        request, agent_id=AGENT_ID, record_id=f"RTN-{s['subject_id']}-{hashlib.sha256(request['request_id'].encode()).hexdigest()[:8]}",
        captured_at=row["captured_at"], operator_id=None,
        refs={"order_id": row["order_id"], "sku": row["ordered_sku"], "asin": row["ordered_asin"]},
        checks=checks, outcome=outcome, verdict=verdict, reason=out.rationale,
        confidence=min(k["confidence"] for k in checks),
        needs_human=outcome == "pending_review" or verdict == "UNCERTAIN", latency_ms=latency_ms,
        model={"name": idc.model_version, "version": "unpinned", "provider": f"openai-compatible:{provider}",
               "prompt_version": PROMPT_VERSION, "calls": 1, "cost_usd": None},
        inputs=[{"ref": ref_of[k], "sha256": sha.get(k), "kind": "image"} for k in ref_of],
        payload={"observed_state": f"packaging={pack.verdict}; usage/damage in condition check",
                 "amazon_condition": cond.verdict, "parts_missing": missing, "condition_graded": graded,
                 "condition_mapping_status": "provisional, needs Pod confirmation (F-11)",
                 "packaging": {"seal_status": pack.verdict, "detail": pack.detail},
                 "rule_source": {"title": scale["source"]["title"], "urls": scale["source"]["urls"],
                                 "retrieved_on": scale["source"]["retrieved_on"], "doc_version": scale["doc_version"]},
                 "cost_note": "cost_usd is null: the provider price for this model is unknown, cost was not computed",
                 "model_calls_note": "1 batched call per unit; the Round 2 client may retry transient API errors",
                 "sent_contents_seen": previous(request, "pack") is not None,
                 "upstream_considered": _upstream(request),
                 "upstream_used_for_judgement": False,
                 "round2_content_hash": rec.content_hash},
    )
    return build_output(record)


# ----------------------------------------------------------------------------------------------- entry point
def handle(request: dict) -> dict:
    s = request["subject"]
    # Tenancy: raises LookupError (HTTP 404) if the unit is not under this org. Nothing else is read first.
    row = sample_data.row("returns", s["subject_id"], s["org_id"])
    imgs = _image_inputs(request)
    return _real(request, row, imgs) if imgs else _replay(request, row)


app = make_app(STAGE, handle, version="1.0.0")
