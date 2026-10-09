"""Round 2 Recovery Manager adapter for the CUBE agent contract."""
from __future__ import annotations

import json
from typing import Any

from shared.utils import groq_vision, sample_data
from shared.utils.records import build_output, build_record, check, pending_output, utcnow
from shared.utils.server import make_app
from shared.utils.stubs import effective_verdict, previous

STAGE = "recovery"
AGENT_ID = "recovery-manager@1"


def _charge_lines(request: dict) -> list[dict]:
    """Read fee rows supplied by the orchestrator, with fixture compatibility."""
    rows: list[dict] = []
    for item in request.get("inputs", []):
        row = item.get("row") or item.get("data")
        if isinstance(row, dict) and row.get("line_id"):
            rows.append(row)
    if rows:
        org_id = request["subject"]["org_id"]
        if any(row.get("org_id") not in (None, org_id) for row in rows):
            raise LookupError("fee input belongs to another organisation")
        return rows
    subject = request["subject"]
    return sample_data.fee_lines(subject["subject_id"], subject["org_id"])


def _position(line: dict, request: dict) -> tuple[str, str, list[str]]:
    """Return CONTRADICTS, SUPPORTS, or SILENT for one charge."""
    charge_type = line.get("charge_type")
    if charge_type == "inbound_defect_fee":
        prep = previous(request, "prep")
        if not prep or prep["status"] != "completed":
            return "SILENT", "no usable Prep record for this subject", []
        record_verdict = effective_verdict(request, prep)
        if record_verdict == "PASS":
            return "CONTRADICTS", "Prep evidence shows the unit compliant", [prep["record_id"]]
        if record_verdict == "FAIL":
            return "SUPPORTS", "Prep evidence shows a defect", [prep["record_id"]]
        return "SILENT", "Prep evidence is uncertain", [prep["record_id"]]

    if charge_type == "refund_issued_item_not_returned":
        returns = previous(request, "returns")
        if returns and returns["status"] == "completed" and returns.get("checks"):
            if effective_verdict(request, returns) == "PASS":
                return "CONTRADICTS", "Returns evidence shows the item came back", [returns["record_id"]]
        return "SILENT", "no usable Returns record", []

    if charge_type == "fulfilment_fee_weight_tier":
        return "SILENT", "no measured weight or dimensions in upstream evidence", []
    if charge_type == "lost_inbound":
        return "SILENT", "receiving shortfall is supplier-side, not channel-side loss", []
    return "SILENT", f"no evidence mapping for {charge_type}", []


def _run_batched_model(request: dict, lines: list[dict]) -> dict:
    """Run one optional model call for the complete unit, never one call per charge."""
    if not groq_vision.api_key():
        return {"name": "round2-recovery-rules", "version": "1", "provider": None, "calls": 0, "cost_usd": 0}
    try:
        prompt = {
            "subject": request["subject"],
            "charges": lines,
            "previous_evidence": request.get("previous_evidence", []),
            "instruction": "Review all charges for this unit in one call. Preserve UNCERTAIN when evidence is insufficient.",
        }
        # Same call as before, on the pod's common provider. As before, the rules above decide every verdict; the
        # model's reply is not used to change one.
        groq_vision.complete(
            "You review marketplace fee charges against warehouse evidence. Never invent evidence; "
            "say UNCERTAIN when the evidence is insufficient.",
            json.dumps(prompt, sort_keys=True), None, max_tokens=1024)
        return {"name": groq_vision.model_name(), "version": "1", "provider": groq_vision.provider(), "calls": 1,
                "cost_usd": None}
    except groq_vision.VisionError as exc:
        raise RuntimeError(f"recovery model call failed: {exc}") from exc


def handle(request: dict) -> dict:
    subject = request["subject"]
    if not sample_data.has("receiving", subject["subject_id"], subject["org_id"]):
        raise LookupError(f"unknown subject {subject['subject_id']} in {subject['org_id']}")
    lines = _charge_lines(request)
    try:
        model = _run_batched_model(request, lines)
    except RuntimeError as exc:
        return pending_output(request, code="model_error", message=str(exc), agent_id=AGENT_ID)
    checks, charges, claimable = [], [], 0.0

    for line in lines:
        position, reason, evidence_refs = _position(line, request)
        amount = float(line.get("amount_usd", line.get("amount_total", 0)) or 0)
        if position == "CONTRADICTS" and amount <= 0:
            position, reason = "SILENT", "charge amount is zero; nothing can be claimed"
        verdict = {"CONTRADICTS": "FAIL", "SUPPORTS": "PASS", "SILENT": "UNCERTAIN"}[position]
        line_id = str(line["line_id"])
        checks.append(
            check(
                f"charge_{line_id.lower().replace('-', '_')}",
                verdict,
                None,
                expected="charge supported by evidence",
                observed=position,
                detail=reason,
                evidence_refs=evidence_refs,
                uncertain_reason="insufficient_evidence",
            )
        )
        if position == "CONTRADICTS":
            claimable += amount
        charges.append(
            {
                "line_id": line_id,
                "charge_type": line.get("charge_type", "unknown"),
                "amount_usd": amount,
                "position": position,
                "reason": reason,
                "evidence_record_ids": evidence_refs,
            }
        )

    has_claim = any(c["position"] == "CONTRADICTS" for c in charges)
    has_silent = any(c["position"] == "SILENT" for c in charges)
    verdict = "FAIL" if has_claim else ("UNCERTAIN" if has_silent else "PASS")
    outcome = "claim_recommended" if has_claim else ("insufficient_evidence" if has_silent else "no_claim")
    record = build_record(
        request,
        agent_id=AGENT_ID,
        record_id=f"RCY-{subject['subject_id']}",
        model=model,
        captured_at=max((str(line.get("posted_date", "")) + "T00:00:00Z" for line in lines), default=utcnow()),
        checks=checks,
        outcome=outcome,
        verdict=verdict,
        needs_human=False,
        reason=f"{len(charges)} charge(s), {sum(c['position'] == 'CONTRADICTS' for c in charges)} contradicted",
        payload={
            "charges": charges,
            "claimable_usd": round(claimable, 2),
            "unclaimable": [c for c in charges if c["position"] != "CONTRADICTS"],
        },
    )
    return build_output(record, next_step="complete")


app = make_app(STAGE, handle)
