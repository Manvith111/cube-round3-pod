"""Unit tests for rtn/policy/completeness.py.

Covers the completeness gate's aggregation rules and, critically, that
MISSING and NOT_OBSERVED are never collapsed into each other regardless of
evidence quality.
"""

from __future__ import annotations

from agents.returns.core.rtn.policy.completeness import gate_completeness
from agents.returns.core.rtn.schemas.enums import EvidenceQuality, PartStatus
from agents.returns.core.rtn.schemas.vlm_output import ComponentObservation


def _part(name: str, status: PartStatus, quality: EvidenceQuality, confidence: float = 0.8) -> ComponentObservation:
    return ComponentObservation(
        part_name=name,
        status=status,
        evidence_quality=quality,
        confidence=confidence,
        detail=f"detail for {name}",
    )


def test_all_present_good_evidence_is_complete():
    parts = [
        _part("body", PartStatus.PRESENT, EvidenceQuality.GOOD),
        _part("lid", PartStatus.PRESENT, EvidenceQuality.GOOD),
    ]
    result = gate_completeness(parts)
    assert result.summary == "COMPLETE"
    assert all(p.status == PartStatus.PRESENT for p in result.parts)


def test_any_missing_is_incomplete():
    parts = [
        _part("body", PartStatus.PRESENT, EvidenceQuality.GOOD),
        _part("lid", PartStatus.MISSING, EvidenceQuality.GOOD),
    ]
    result = gate_completeness(parts)
    assert result.summary == "INCOMPLETE"


def test_any_not_observed_without_missing_is_uncertain():
    parts = [
        _part("body", PartStatus.PRESENT, EvidenceQuality.GOOD),
        _part("lid", PartStatus.NOT_OBSERVED, EvidenceQuality.PARTIAL),
    ]
    result = gate_completeness(parts)
    assert result.summary == "UNCERTAIN"


def test_missing_takes_priority_over_not_observed_in_summary():
    parts = [
        _part("body", PartStatus.NOT_OBSERVED, EvidenceQuality.PARTIAL),
        _part("lid", PartStatus.MISSING, EvidenceQuality.GOOD),
    ]
    result = gate_completeness(parts)
    # INCOMPLETE (a definite negative finding) must win over an UNCERTAIN
    # NOT_OBSERVED elsewhere — a confirmed missing part is stronger signal.
    assert result.summary == "INCOMPLETE"


def test_poor_evidence_quality_downgrades_present_to_not_observed():
    parts = [_part("lid", PartStatus.PRESENT, EvidenceQuality.POOR, confidence=0.95)]
    result = gate_completeness(parts)
    assert result.parts[0].status == PartStatus.NOT_OBSERVED
    assert result.parts[0].confidence <= 0.4
    assert result.summary == "UNCERTAIN"


def test_poor_evidence_quality_does_not_override_a_missing_call():
    """A MISSING call backed by poor evidence quality is left as MISSING,
    not silently reinterpreted as NOT_OBSERVED -- the model claimed to see
    the expected area empty, and that claim is preserved (poor evidence
    quality is still recorded and visible downstream, but MISSING/
    NOT_OBSERVED are never collapsed into each other by this gate)."""
    parts = [_part("lid", PartStatus.MISSING, EvidenceQuality.POOR, confidence=0.9)]
    result = gate_completeness(parts)
    assert result.parts[0].status == PartStatus.MISSING
    assert result.summary == "INCOMPLETE"


def test_insufficient_evidence_quality_downgrades_present_too():
    parts = [_part("lid", PartStatus.PRESENT, EvidenceQuality.INSUFFICIENT)]
    result = gate_completeness(parts)
    assert result.parts[0].status == PartStatus.NOT_OBSERVED


def test_worst_evidence_quality_is_tracked_across_parts():
    parts = [
        _part("body", PartStatus.PRESENT, EvidenceQuality.GOOD),
        _part("lid", PartStatus.PRESENT, EvidenceQuality.PARTIAL),
    ]
    result = gate_completeness(parts)
    assert result.worst_evidence_quality == EvidenceQuality.PARTIAL


def test_min_confidence_is_tracked_across_parts():
    parts = [
        _part("body", PartStatus.PRESENT, EvidenceQuality.GOOD, confidence=0.95),
        _part("lid", PartStatus.PRESENT, EvidenceQuality.GOOD, confidence=0.6),
    ]
    result = gate_completeness(parts)
    assert result.min_confidence == 0.6
