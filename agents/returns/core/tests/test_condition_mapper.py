"""Unit tests for rtn/policy/condition_mapper.py.

Verifies the deterministic observations -> AmazonCondition mapping rules,
including the safety-floor rule (severe damage / missing essential part /
explicit functional failure -> UNSELLABLE) and the insufficient-evidence
escape hatch (-> UNDETERMINED, never a guessed grade).
"""

from __future__ import annotations

from agents.returns.core.rtn.policy.condition_mapper import map_condition
from agents.returns.core.rtn.schemas.enums import (
    AmazonCondition,
    EvidenceQuality,
    SealStatus,
    StructuralDamageLevel,
    UsageSignLevel,
)
from agents.returns.core.rtn.schemas.vlm_output import ConditionObservation


def _cond(
    seal=SealStatus.SEALED,
    usage=UsageSignLevel.NONE,
    damage=StructuralDamageLevel.NONE,
    quality=EvidenceQuality.GOOD,
    negative_signs=None,
) -> ConditionObservation:
    return ConditionObservation(
        seal_status=seal,
        packaging_state_detail="test packaging",
        usage_signs=usage,
        usage_signs_detail="test usage",
        structural_damage=damage,
        structural_damage_detail="test damage",
        functional_signs_positive=[],
        functional_signs_negative=negative_signs or [],
        evidence_quality=quality,
        confidence=0.9,
    )


def test_sealed_no_signs_complete_is_new():
    result = map_condition(_cond(), completeness_summary="COMPLETE", essential_part_missing=False)
    assert result.condition == AmazonCondition.NEW


def test_opened_no_signs_complete_is_used_like_new():
    result = map_condition(
        _cond(seal=SealStatus.OPENED), completeness_summary="COMPLETE", essential_part_missing=False
    )
    assert result.condition == AmazonCondition.USED_LIKE_NEW


def test_light_usage_minor_damage_is_used_very_good():
    result = map_condition(
        _cond(seal=SealStatus.OPENED, usage=UsageSignLevel.LIGHT, damage=StructuralDamageLevel.MINOR),
        completeness_summary="INCOMPLETE",  # condition mapping is independent of completeness here
        essential_part_missing=False,
    )
    assert result.condition == AmazonCondition.USED_VERY_GOOD


def test_moderate_usage_is_used_good():
    result = map_condition(
        _cond(usage=UsageSignLevel.MODERATE), completeness_summary="COMPLETE", essential_part_missing=False
    )
    assert result.condition == AmazonCondition.USED_GOOD


def test_moderate_damage_is_used_good():
    result = map_condition(
        _cond(damage=StructuralDamageLevel.MODERATE), completeness_summary="COMPLETE", essential_part_missing=False
    )
    assert result.condition == AmazonCondition.USED_GOOD


def test_heavy_usage_no_severe_damage_is_used_acceptable():
    result = map_condition(
        _cond(usage=UsageSignLevel.HEAVY), completeness_summary="COMPLETE", essential_part_missing=False
    )
    assert result.condition == AmazonCondition.USED_ACCEPTABLE


def test_severe_structural_damage_is_unsellable_regardless_of_usage_signs():
    result = map_condition(
        _cond(usage=UsageSignLevel.NONE, damage=StructuralDamageLevel.SEVERE),
        completeness_summary="COMPLETE",
        essential_part_missing=False,
    )
    assert result.condition == AmazonCondition.UNSELLABLE


def test_missing_essential_part_is_unsellable_even_with_no_damage():
    result = map_condition(_cond(), completeness_summary="INCOMPLETE", essential_part_missing=True)
    assert result.condition == AmazonCondition.UNSELLABLE


def test_explicit_functional_failure_signs_force_unsellable():
    result = map_condition(
        _cond(negative_signs=["cracked screen, does not power on"]),
        completeness_summary="COMPLETE",
        essential_part_missing=False,
    )
    assert result.condition == AmazonCondition.UNSELLABLE


def test_poor_evidence_quality_is_undetermined_not_a_guess():
    result = map_condition(
        _cond(quality=EvidenceQuality.POOR), completeness_summary="COMPLETE", essential_part_missing=False
    )
    assert result.condition == AmazonCondition.UNDETERMINED


def test_insufficient_evidence_quality_is_undetermined():
    result = map_condition(
        _cond(quality=EvidenceQuality.INSUFFICIENT), completeness_summary="COMPLETE", essential_part_missing=False
    )
    assert result.condition == AmazonCondition.UNDETERMINED


def test_severe_damage_beats_evidence_quality_check_order_is_still_safe():
    # Even though this looks like it should be UNSELLABLE, evidence quality
    # is checked first (R0) — poor evidence must never be overridden by a
    # damage claim either, since a damage call made under poor evidence is
    # itself untrustworthy.
    result = map_condition(
        _cond(damage=StructuralDamageLevel.SEVERE, quality=EvidenceQuality.POOR),
        completeness_summary="COMPLETE",
        essential_part_missing=False,
    )
    assert result.condition == AmazonCondition.UNDETERMINED
