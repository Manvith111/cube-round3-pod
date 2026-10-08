"""Completeness gating and summarization.

Applies the same evidence-quality-based UNCERTAIN gate to each component
observation, then rolls per-part statuses up into one aggregate
completeness summary used by the disposition rules. PRESENT/MISSING/
NOT_OBSERVED are never collapsed at this stage either — the aggregate is a
summary label, but each part's original status is preserved in
raw_observation for the evidence record.
"""

from __future__ import annotations

from dataclasses import dataclass

from agents.returns.core.rtn.policy.uncertainty_gate import POOR_EVIDENCE_QUALITIES
from agents.returns.core.rtn.schemas.enums import EvidenceQuality, PartStatus
from agents.returns.core.rtn.schemas.vlm_output import ComponentObservation


@dataclass
class GatedComponent:
    part_name: str
    status: PartStatus
    confidence: float
    evidence_quality: EvidenceQuality
    reason: str


@dataclass
class CompletenessResult:
    parts: list[GatedComponent]
    summary: str  # COMPLETE / INCOMPLETE / UNCERTAIN
    worst_evidence_quality: EvidenceQuality
    min_confidence: float


def gate_completeness(observations: list[ComponentObservation]) -> CompletenessResult:
    if not observations:
        # No expected components were registered for this unit — there is
        # nothing to grade as present/missing/not-observed. This is a
        # legitimate "not applicable" case, not an error: treat it as
        # COMPLETE (vacuously true) rather than crashing or guessing.
        return CompletenessResult(
            parts=[], summary="COMPLETE", worst_evidence_quality=EvidenceQuality.GOOD, min_confidence=1.0
        )

    gated: list[GatedComponent] = []
    for obs in observations:
        if obs.evidence_quality in POOR_EVIDENCE_QUALITIES and obs.status != PartStatus.MISSING:
            # Poor evidence can't support a confident PRESENT claim, but a
            # MISSING call backed by "the expected area IS visible and
            # empty" is a positive observation, not an absence of one —
            # only downgrade non-MISSING (i.e. PRESENT) calls here.
            gated.append(
                GatedComponent(
                    part_name=obs.part_name,
                    status=PartStatus.NOT_OBSERVED,
                    confidence=min(obs.confidence, 0.4),
                    evidence_quality=obs.evidence_quality,
                    reason=(
                        f"evidence_quality={obs.evidence_quality.value} downgrades "
                        f"{obs.status.value} -> NOT_OBSERVED for '{obs.part_name}'."
                    ),
                )
            )
        else:
            gated.append(
                GatedComponent(
                    part_name=obs.part_name,
                    status=obs.status,
                    confidence=obs.confidence,
                    evidence_quality=obs.evidence_quality,
                    reason=f"VLM status accepted for '{obs.part_name}'.",
                )
            )

    statuses = {g.status for g in gated}
    if PartStatus.NOT_OBSERVED in statuses and PartStatus.MISSING not in statuses:
        summary = "UNCERTAIN"
    elif PartStatus.MISSING in statuses:
        summary = "INCOMPLETE"
    elif statuses == {PartStatus.PRESENT}:
        summary = "COMPLETE"
    else:
        # mix of PRESENT and NOT_OBSERVED and/or MISSING already handled;
        # any remaining mixed case defaults to UNCERTAIN rather than
        # guessing.
        summary = "UNCERTAIN"

    quality_rank = {
        EvidenceQuality.INSUFFICIENT: 0,
        EvidenceQuality.POOR: 1,
        EvidenceQuality.PARTIAL: 2,
        EvidenceQuality.GOOD: 3,
    }
    worst = min(gated, key=lambda g: quality_rank[g.evidence_quality]).evidence_quality
    min_conf = min((g.confidence for g in gated), default=0.0)

    return CompletenessResult(
        parts=gated, summary=summary, worst_evidence_quality=worst, min_confidence=min_conf
    )
