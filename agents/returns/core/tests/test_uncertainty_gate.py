"""Unit tests for rtn/policy/uncertainty_gate.py.

Covers the evidence-based UNCERTAIN gating rules for the identity check:
poor evidence quality, VLM-reported UNCERTAIN, and fusion-signal
disagreement — each of which must force UNCERTAIN independently of
confidence.
"""

from __future__ import annotations

from agents.returns.core.rtn.perception.fusion import FusionSignal
from agents.returns.core.rtn.policy.uncertainty_gate import gate_identity
from agents.returns.core.rtn.schemas.enums import EvidenceQuality, IdentityVerdict
from agents.returns.core.rtn.schemas.vlm_output import IdentityObservation

NO_FUSION = FusionSignal(available=False, similarity=None, reason="not wired")


def _identity_obs(
    verdict: IdentityVerdict = IdentityVerdict.MATCH,
    evidence_quality: EvidenceQuality = EvidenceQuality.GOOD,
    confidence: float = 0.9,
) -> IdentityObservation:
    return IdentityObservation(
        verdict=verdict,
        matching_attributes=["shape"],
        conflicting_attributes=[],
        evidence_quality=evidence_quality,
        confidence=confidence,
        detail="test detail",
    )


def test_good_evidence_no_fusion_accepts_vlm_verdict():
    obs = _identity_obs(verdict=IdentityVerdict.MATCH, evidence_quality=EvidenceQuality.GOOD, confidence=0.9)
    gated = gate_identity(obs, NO_FUSION)
    assert gated.verdict == IdentityVerdict.MATCH
    assert gated.confidence == 0.9


def test_poor_evidence_quality_forces_uncertain_even_with_high_confidence():
    obs = _identity_obs(verdict=IdentityVerdict.MATCH, evidence_quality=EvidenceQuality.POOR, confidence=0.99)
    gated = gate_identity(obs, NO_FUSION)
    assert gated.verdict == IdentityVerdict.UNCERTAIN
    # confidence must be capped, not passed through as the model's stated 0.99
    assert gated.confidence <= 0.4


def test_insufficient_evidence_quality_forces_uncertain():
    obs = _identity_obs(evidence_quality=EvidenceQuality.INSUFFICIENT, confidence=0.8)
    gated = gate_identity(obs, NO_FUSION)
    assert gated.verdict == IdentityVerdict.UNCERTAIN


def test_vlm_reported_uncertain_is_respected():
    obs = _identity_obs(verdict=IdentityVerdict.UNCERTAIN, evidence_quality=EvidenceQuality.GOOD)
    gated = gate_identity(obs, NO_FUSION)
    assert gated.verdict == IdentityVerdict.UNCERTAIN
    assert "UNCERTAIN directly" in gated.reason


def test_fusion_disagreement_on_match_forces_uncertain():
    obs = _identity_obs(verdict=IdentityVerdict.MATCH, evidence_quality=EvidenceQuality.GOOD, confidence=0.9)
    # low similarity disagrees with a claimed MATCH
    fusion = FusionSignal(available=True, similarity=0.2)
    gated = gate_identity(obs, fusion)
    assert gated.verdict == IdentityVerdict.UNCERTAIN
    assert gated.fusion_signals["agreement_with_vlm"] is False


def test_fusion_agreement_on_match_accepts_verdict():
    obs = _identity_obs(verdict=IdentityVerdict.MATCH, evidence_quality=EvidenceQuality.GOOD, confidence=0.9)
    fusion = FusionSignal(available=True, similarity=0.9)
    gated = gate_identity(obs, fusion)
    assert gated.verdict == IdentityVerdict.MATCH
    assert gated.fusion_signals["agreement_with_vlm"] is True


def test_fusion_disagreement_on_no_match_forces_uncertain():
    obs = _identity_obs(verdict=IdentityVerdict.NO_MATCH, evidence_quality=EvidenceQuality.GOOD, confidence=0.9)
    # high similarity disagrees with a claimed NO_MATCH
    fusion = FusionSignal(available=True, similarity=0.95)
    gated = gate_identity(obs, fusion)
    assert gated.verdict == IdentityVerdict.UNCERTAIN


def test_fusion_agreement_on_no_match_accepts_verdict():
    obs = _identity_obs(verdict=IdentityVerdict.NO_MATCH, evidence_quality=EvidenceQuality.GOOD, confidence=0.9)
    fusion = FusionSignal(available=True, similarity=0.1)
    gated = gate_identity(obs, fusion)
    assert gated.verdict == IdentityVerdict.NO_MATCH


def test_fusion_unavailable_does_not_block_match_verdict():
    obs = _identity_obs(verdict=IdentityVerdict.MATCH, evidence_quality=EvidenceQuality.GOOD, confidence=0.9)
    gated = gate_identity(obs, NO_FUSION)
    assert gated.verdict == IdentityVerdict.MATCH
    assert gated.fusion_signals["fusion_available"] is False
