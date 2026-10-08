"""Evidence record data model — the audit layer contract.

Every decision the system makes must produce exactly one EvidenceRecord.
This schema is intentionally fixed and versioned (schema_version) so that
historical records remain interpretable even as the pipeline evolves.

Immutability note: EvidenceRecord instances are treated as append-only once
written. Corrections happen via `overrides[]` entries (see Override below),
never by mutating a check's original verdict/confidence/detail in place.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, Field

from agents.returns.core.rtn.schemas.enums import (
    AmazonCondition,
    CheckKey,
    DecidedBy,
    Disposition,
    EvidenceQuality,
    RecordStatus,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ImageRef(BaseModel):
    """Reference to one input image used as evidence."""

    image_id: str
    role: str = Field(
        description="One of: 'reference' (catalogue/expected-product image) "
        "or 'returned' (photo of the actual returned unit)."
    )
    path_or_url: str
    content_hash: str | None = Field(
        default=None,
        description="SHA-256 of the image bytes, for tamper-evidence and "
        "dedup. Populated by rtn/audit/hashing.py.",
    )


class Check(BaseModel):
    """One evaluated check (identity / completeness / condition / packaging)
    within an evidence record. `verdict` here is the POLICY layer's final
    verdict for this check (after uncertainty gating), not the raw VLM
    observation — the raw observation is preserved in `raw_observation` for
    full traceability.
    """

    check_key: CheckKey
    verdict: str = Field(
        description="Final verdict string for this check, e.g. 'MATCH', "
        "'NO_MATCH', 'UNCERTAIN', or for completeness a per-part summary "
        "verdict such as 'COMPLETE' / 'INCOMPLETE' / 'UNCERTAIN'."
    )
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_quality: EvidenceQuality
    detail: str
    model_version: str = Field(
        description="Identifier of the VLM (and version/snapshot) that "
        "produced the underlying observation, e.g. 'gpt-4o-2024-08-06'."
    )
    latency_ms: int = Field(ge=0)
    raw_observation: dict = Field(
        default_factory=dict,
        description="The untouched raw observation payload from the VLM "
        "(and, for identity, the fusion signal) that this check's verdict "
        "was computed from. Immutable evidence — never edited in place.",
    )
    fusion_signals: dict = Field(
        default_factory=dict,
        description="Any secondary signals folded in for this check, e.g. "
        "{'clip_similarity': 0.42, 'agreement_with_vlm': false}.",
    )


class Outcome(BaseModel):
    """The final decision for the unit as a whole."""

    identity_verdict: str
    completeness_summary: str = Field(
        description="Aggregate completeness verdict, e.g. 'COMPLETE', "
        "'INCOMPLETE', 'UNCERTAIN'."
    )
    amazon_condition: AmazonCondition
    disposition: Disposition
    decided_by: DecidedBy
    decided_at: datetime = Field(default_factory=_utcnow)
    rationale: str = Field(
        description="Deterministic-rule trace explaining how the disposition "
        "was derived from identity/completeness/condition — e.g. "
        "'condition=USED_ACCEPTABLE, identity=MATCH, completeness=COMPLETE "
        "-> rule R3 -> RESTOCK'."
    )


class Override(BaseModel):
    """A human correction to a check verdict or the final outcome. Captured
    as data, never as a silent in-place edit."""

    override_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    target: str = Field(
        description="What was overridden, e.g. 'check:condition' or "
        "'outcome:disposition'."
    )
    original_verdict: str
    new_verdict: str
    reason: str
    who: str
    when: datetime = Field(default_factory=_utcnow)


class EvidenceRecord(BaseModel):
    """The fixed-schema audit record. One per unit evaluation."""

    model_config = {"extra": "forbid"}

    record_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    schema_version: str = Field(default="1.0")

    # --- multi-tenant isolation fields (always required, always filtered on) ---
    organization_id: str
    client_id: str

    agent: str = Field(default="rtn-agent")
    subject: str = Field(
        description="Identifier of the unit under evaluation, e.g. return/RMA id."
    )
    captured_at: datetime = Field(
        description="Timestamp the return photos were captured/uploaded."
    )
    operator_label: str | None = Field(
        default=None,
        description="Optional human-readable label an operator attached "
        "(e.g. order/SKU note). Not used as ground truth.",
    )

    images: list[ImageRef] = Field(default_factory=list)
    checks: list[Check] = Field(default_factory=list)
    outcome: Outcome | None = Field(
        default=None,
        description="None only while status == PENDING (fail-open case).",
    )
    overrides: list[Override] = Field(default_factory=list)

    status: RecordStatus = Field(default=RecordStatus.PENDING)
    content_hash: str = Field(
        description="SHA-256 over the record's stable content (images + "
        "checks + outcome), computed by rtn/audit/hashing.py, used to "
        "detect any post-hoc tampering with a supposedly-frozen record."
    )

    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
