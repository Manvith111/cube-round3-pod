"""Uncertainty gating.

UNCERTAIN is a first-class outcome computed from evidence, not from
thresholding a single confidence number. This module forces UNCERTAIN when:
  - the VLM's own evidence_quality for a check is POOR/INSUFFICIENT, or
  - the identity check's VLM verdict disagrees with the CLIP/SigLIP fusion
    similarity signal (when the fusion signal is available), or
  - the VLM verdict is already UNCERTAIN.

This module does NOT decide Amazon condition or disposition — it only
produces gated per-check verdicts + confidence + evidence_quality that the
rest of the policy layer (condition_mapper, disposition_rules) consumes.
"""

from __future__ import annotations

from dataclasses import dataclass

from agents.returns.core.rtn.perception.fusion import FusionSignal
from agents.returns.core.rtn.schemas.enums import EvidenceQuality, IdentityVerdict
from agents.returns.core.rtn.schemas.vlm_output import IdentityObservation

# Below this cosine similarity, we treat the fusion signal as "does not
# support a match" for disagreement purposes. Chosen as a conservative,
# documented constant for Day 1 — revisit with real data in Day 4.
FUSION_MATCH_SIMILARITY_THRESHOLD = 0.75
FUSION_NO_MATCH_SIMILARITY_THRESHOLD = 0.55

POOR_EVIDENCE_QUALITIES = {EvidenceQuality.POOR, EvidenceQuality.INSUFFICIENT}


@dataclass
class GatedIdentity:
    verdict: IdentityVerdict
    confidence: float
    evidence_quality: EvidenceQuality
    reason: str
    fusion_signals: dict


def gate_identity(observation: IdentityObservation, fusion: FusionSignal) -> GatedIdentity:
    """Fuses the VLM identity observation with the optional embedding
    similarity signal and applies the evidence-based UNCERTAIN gate.
    """
    fusion_signals: dict = {
        "fusion_available": fusion.available,
        "clip_similarity": fusion.similarity,
    }

    # Gate 1: VLM's own evidence quality is poor -> UNCERTAIN, regardless of
    # what it claims to have concluded.
    if observation.evidence_quality in POOR_EVIDENCE_QUALITIES:
        return GatedIdentity(
            verdict=IdentityVerdict.UNCERTAIN,
            confidence=min(observation.confidence, 0.4),
            evidence_quality=observation.evidence_quality,
            reason=(
                f"VLM evidence_quality={observation.evidence_quality.value} for identity "
                f"check forces UNCERTAIN regardless of stated confidence "
                f"({observation.confidence:.2f})."
            ),
            fusion_signals=fusion_signals,
        )

    # Gate 2: VLM already said UNCERTAIN -> respect it.
    if observation.verdict == IdentityVerdict.UNCERTAIN:
        return GatedIdentity(
            verdict=IdentityVerdict.UNCERTAIN,
            confidence=observation.confidence,
            evidence_quality=observation.evidence_quality,
            reason="VLM reported UNCERTAIN directly.",
            fusion_signals=fusion_signals,
        )

    # Gate 3: fusion signal disagreement, only when fusion is available.
    if fusion.available and fusion.similarity is not None:
        agrees = _fusion_agrees(observation.verdict, fusion.similarity)
        fusion_signals["agreement_with_vlm"] = agrees
        if not agrees:
            return GatedIdentity(
                verdict=IdentityVerdict.UNCERTAIN,
                confidence=min(observation.confidence, 0.5),
                evidence_quality=observation.evidence_quality,
                reason=(
                    f"VLM verdict={observation.verdict.value} but embedding "
                    f"similarity={fusion.similarity:.2f} disagrees "
                    f"-> forced UNCERTAIN by signal-disagreement gate."
                ),
                fusion_signals=fusion_signals,
            )

    # No disagreement, evidence quality acceptable -> trust the VLM verdict.
    return GatedIdentity(
        verdict=observation.verdict,
        confidence=observation.confidence,
        evidence_quality=observation.evidence_quality,
        reason="VLM verdict accepted: evidence quality acceptable, no fusion disagreement.",
        fusion_signals=fusion_signals,
    )


def _fusion_agrees(verdict: IdentityVerdict, similarity: float) -> bool:
    if verdict == IdentityVerdict.MATCH:
        return similarity >= FUSION_NO_MATCH_SIMILARITY_THRESHOLD
    if verdict == IdentityVerdict.NO_MATCH:
        return similarity <= FUSION_MATCH_SIMILARITY_THRESHOLD
    return True
