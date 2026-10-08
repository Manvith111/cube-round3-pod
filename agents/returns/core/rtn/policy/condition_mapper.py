"""Maps raw VLM condition observations -> an Amazon condition category.

This is a deterministic rules engine, not a model call. It consumes only
the primitive observations the VLM is allowed to report (seal_status,
usage_signs, structural_damage, functional signs, evidence_quality) and
returns one AmazonCondition label plus a human-readable rule trace.

Rules encode the dimensions Amazon itself publishes (functionality,
cosmetic damage, accessories/completeness, packaging) — see
rtn/reference_data/amazon_condition_scale.json for the source definitions
these rules are operationalizing.
"""

from __future__ import annotations

from dataclasses import dataclass

from agents.returns.core.rtn.schemas.enums import (
    AmazonCondition,
    EvidenceQuality,
    SealStatus,
    StructuralDamageLevel,
    UsageSignLevel,
)
from agents.returns.core.rtn.schemas.vlm_output import ConditionObservation

INSUFFICIENT_EVIDENCE = {EvidenceQuality.POOR, EvidenceQuality.INSUFFICIENT}


@dataclass
class ConditionMappingResult:
    condition: AmazonCondition
    rationale: str


def map_condition(
    obs: ConditionObservation,
    completeness_summary: str,
    essential_part_missing: bool,
) -> ConditionMappingResult:
    # Rule 0: evidence too poor to grade at all.
    if obs.evidence_quality in INSUFFICIENT_EVIDENCE:
        return ConditionMappingResult(
            condition=AmazonCondition.UNDETERMINED,
            rationale=(
                f"R0: condition evidence_quality={obs.evidence_quality.value} "
                f"-> UNDETERMINED (cannot grade against Amazon condition scale)."
            ),
        )

    # Rule 1: severe structural damage or a missing essential part fails the
    # functional/safety floor required even for Used-Acceptable.
    if obs.structural_damage == StructuralDamageLevel.SEVERE or essential_part_missing:
        return ConditionMappingResult(
            condition=AmazonCondition.UNSELLABLE,
            rationale=(
                "R1: structural_damage=SEVERE or an essential component is "
                "MISSING -> below Used-Acceptable functional floor -> UNSELLABLE."
            ),
        )

    if obs.functional_signs_negative:
        return ConditionMappingResult(
            condition=AmazonCondition.UNSELLABLE,
            rationale=(
                f"R1b: explicit functional failure signs observed "
                f"({obs.functional_signs_negative}) -> UNSELLABLE."
            ),
        )

    # Rule 2: New — sealed packaging, no usage signs, no damage, complete.
    if (
        obs.seal_status == SealStatus.SEALED
        and obs.usage_signs == UsageSignLevel.NONE
        and obs.structural_damage == StructuralDamageLevel.NONE
        and completeness_summary == "COMPLETE"
    ):
        return ConditionMappingResult(
            condition=AmazonCondition.NEW,
            rationale="R2: sealed + no usage signs + no damage + complete -> NEW.",
        )

    # Rule 3: Used - Like New — opened but no cosmetic/usage signs, minor/no
    # damage, complete (non-essential parts may still be missing per scale
    # text, but Day-1 rule keeps this conservative: require COMPLETE or
    # UNCERTAIN-only-on-non-essential).
    if (
        obs.seal_status in {SealStatus.OPENED, SealStatus.SEALED}
        and obs.usage_signs == UsageSignLevel.NONE
        and obs.structural_damage == StructuralDamageLevel.NONE
        and completeness_summary in {"COMPLETE"}
    ):
        return ConditionMappingResult(
            condition=AmazonCondition.USED_LIKE_NEW,
            rationale=(
                "R3: opened/sealed packaging + no usage signs + no structural "
                "damage + complete -> USED_LIKE_NEW."
            ),
        )

    # Rule 4: Used - Very Good — light usage signs, at most minor damage,
    # packaging may be damaged/repackaged.
    if (
        obs.usage_signs in {UsageSignLevel.NONE, UsageSignLevel.LIGHT}
        and obs.structural_damage in {StructuralDamageLevel.NONE, StructuralDamageLevel.MINOR}
    ):
        return ConditionMappingResult(
            condition=AmazonCondition.USED_VERY_GOOD,
            rationale=(
                "R4: usage_signs<=LIGHT and structural_damage<=MINOR "
                "-> USED_VERY_GOOD."
            ),
        )

    # Rule 5: Used - Good — moderate usage signs and/or moderate damage,
    # still clearly functional (no negative functional signs, handled in
    # R1b above).
    if (
        obs.usage_signs == UsageSignLevel.MODERATE
        or obs.structural_damage == StructuralDamageLevel.MODERATE
    ):
        return ConditionMappingResult(
            condition=AmazonCondition.USED_GOOD,
            rationale="R5: moderate usage_signs and/or moderate structural_damage -> USED_GOOD.",
        )

    # Rule 6: Used - Acceptable — heavy wear but no severe structural damage
    # and no explicit functional failure (already excluded by R1/R1b).
    if obs.usage_signs == UsageSignLevel.HEAVY:
        return ConditionMappingResult(
            condition=AmazonCondition.USED_ACCEPTABLE,
            rationale="R6: heavy usage_signs, no severe damage, functional -> USED_ACCEPTABLE.",
        )

    # Fallback: nothing matched cleanly -> don't guess.
    return ConditionMappingResult(
        condition=AmazonCondition.UNDETERMINED,
        rationale=(
            "R_fallback: observation combination not covered by rules R1-R6 "
            "-> UNDETERMINED (routed to PENDING_REVIEW by disposition rules)."
        ),
    )
