"""Unit tests for rtn/policy/disposition_rules.py.

Verifies the deterministic disposition decision table: any uncertainty
anywhere (identity, completeness, or condition) routes to PENDING_REVIEW
before condition-specific rules are ever consulted.
"""

from __future__ import annotations

from agents.returns.core.rtn.policy.disposition_rules import decide_disposition
from agents.returns.core.rtn.schemas.enums import AmazonCondition, Disposition, IdentityVerdict


def test_no_match_identity_always_pending_review():
    result = decide_disposition(IdentityVerdict.NO_MATCH, "COMPLETE", AmazonCondition.NEW)
    assert result.disposition == Disposition.PENDING_REVIEW


def test_uncertain_identity_always_pending_review():
    result = decide_disposition(IdentityVerdict.UNCERTAIN, "COMPLETE", AmazonCondition.NEW)
    assert result.disposition == Disposition.PENDING_REVIEW


def test_undetermined_condition_always_pending_review():
    result = decide_disposition(IdentityVerdict.MATCH, "COMPLETE", AmazonCondition.UNDETERMINED)
    assert result.disposition == Disposition.PENDING_REVIEW


def test_uncertain_completeness_always_pending_review_even_with_new_condition():
    result = decide_disposition(IdentityVerdict.MATCH, "UNCERTAIN", AmazonCondition.NEW)
    assert result.disposition == Disposition.PENDING_REVIEW


def test_new_complete_is_restock():
    result = decide_disposition(IdentityVerdict.MATCH, "COMPLETE", AmazonCondition.NEW)
    assert result.disposition == Disposition.RESTOCK


def test_used_like_new_complete_is_restock():
    result = decide_disposition(IdentityVerdict.MATCH, "COMPLETE", AmazonCondition.USED_LIKE_NEW)
    assert result.disposition == Disposition.RESTOCK


def test_used_very_good_complete_is_restock():
    result = decide_disposition(IdentityVerdict.MATCH, "COMPLETE", AmazonCondition.USED_VERY_GOOD)
    assert result.disposition == Disposition.RESTOCK


def test_used_good_incomplete_is_liquidate():
    result = decide_disposition(IdentityVerdict.MATCH, "INCOMPLETE", AmazonCondition.USED_GOOD)
    assert result.disposition == Disposition.LIQUIDATE


def test_used_acceptable_is_always_liquidate_regardless_of_completeness():
    complete = decide_disposition(IdentityVerdict.MATCH, "COMPLETE", AmazonCondition.USED_ACCEPTABLE)
    incomplete = decide_disposition(IdentityVerdict.MATCH, "INCOMPLETE", AmazonCondition.USED_ACCEPTABLE)
    assert complete.disposition == Disposition.LIQUIDATE
    assert incomplete.disposition == Disposition.LIQUIDATE


def test_unsellable_incomplete_is_dispose():
    result = decide_disposition(IdentityVerdict.MATCH, "INCOMPLETE", AmazonCondition.UNSELLABLE)
    assert result.disposition == Disposition.DISPOSE


def test_unsellable_complete_is_refurbish():
    result = decide_disposition(IdentityVerdict.MATCH, "COMPLETE", AmazonCondition.UNSELLABLE)
    assert result.disposition == Disposition.REFURBISH


def test_identity_no_match_overrides_everything_else():
    """Even a perfect-condition, complete item must go to PENDING_REVIEW if
    identity doesn't match -- we never restock/liquidate/dispose the wrong
    SKU automatically."""
    result = decide_disposition(IdentityVerdict.NO_MATCH, "COMPLETE", AmazonCondition.NEW)
    assert result.disposition == Disposition.PENDING_REVIEW
