"""Final disposition rules.

Deterministic function of (identity verdict, completeness summary, Amazon
condition). Never computed by the model. This is the last step before an
Outcome is written to the evidence record.
"""

from __future__ import annotations

from dataclasses import dataclass

from agents.returns.core.rtn.schemas.enums import AmazonCondition, Disposition, IdentityVerdict


@dataclass
class DispositionResult:
    disposition: Disposition
    rationale: str


def decide_disposition(
    identity_verdict: IdentityVerdict,
    completeness_summary: str,
    condition: AmazonCondition,
) -> DispositionResult:
    # Rule D1: identity mismatch or uncertain identity always routes to
    # human review — we never restock/refurbish/liquidate/dispose an item
    # we aren't confident is the right SKU.
    if identity_verdict == IdentityVerdict.NO_MATCH:
        return DispositionResult(
            disposition=Disposition.PENDING_REVIEW,
            rationale="D1: identity=NO_MATCH -> PENDING_REVIEW (wrong item, needs human triage).",
        )
    if identity_verdict == IdentityVerdict.UNCERTAIN:
        return DispositionResult(
            disposition=Disposition.PENDING_REVIEW,
            rationale="D1b: identity=UNCERTAIN -> PENDING_REVIEW.",
        )

    # Rule D2: condition undetermined -> review.
    if condition == AmazonCondition.UNDETERMINED:
        return DispositionResult(
            disposition=Disposition.PENDING_REVIEW,
            rationale="D2: condition=UNDETERMINED -> PENDING_REVIEW.",
        )

    # Rule D3: completeness uncertain -> review (can't safely grade
    # sellability without knowing what's in the box).
    if completeness_summary == "UNCERTAIN":
        return DispositionResult(
            disposition=Disposition.PENDING_REVIEW,
            rationale="D3: completeness=UNCERTAIN -> PENDING_REVIEW.",
        )

    # Rule D4: unsellable condition.
    if condition == AmazonCondition.UNSELLABLE:
        if completeness_summary == "INCOMPLETE":
            return DispositionResult(
                disposition=Disposition.DISPOSE,
                rationale=(
                    "D4a: condition=UNSELLABLE and completeness=INCOMPLETE "
                    "-> DISPOSE (not economical to refurbish an incomplete, "
                    "structurally-failed unit)."
                ),
            )
        return DispositionResult(
            disposition=Disposition.REFURBISH,
            rationale=(
                "D4b: condition=UNSELLABLE but completeness=COMPLETE "
                "-> REFURBISH (worth attempting repair before liquidating)."
            ),
        )

    # Rule D5: sellable-as-new-or-like-new + complete -> restock.
    if condition in {AmazonCondition.NEW, AmazonCondition.USED_LIKE_NEW} and completeness_summary == "COMPLETE":
        return DispositionResult(
            disposition=Disposition.RESTOCK,
            rationale=f"D5: condition={condition.value} and completeness=COMPLETE -> RESTOCK.",
        )

    # Rule D6: Very Good / Good, complete -> restock as used; incomplete ->
    # liquidate (sellable condition-wise but missing parts, not worth
    # refurbishing to replace parts).
    if condition in {AmazonCondition.USED_VERY_GOOD, AmazonCondition.USED_GOOD}:
        if completeness_summary == "COMPLETE":
            return DispositionResult(
                disposition=Disposition.RESTOCK,
                rationale=f"D6a: condition={condition.value} and completeness=COMPLETE -> RESTOCK.",
            )
        return DispositionResult(
            disposition=Disposition.LIQUIDATE,
            rationale=f"D6b: condition={condition.value} but completeness=INCOMPLETE -> LIQUIDATE.",
        )

    # Rule D7: Acceptable -> liquidate regardless of completeness (lowest
    # sellable tier, not worth restocking through the primary channel).
    if condition == AmazonCondition.USED_ACCEPTABLE:
        return DispositionResult(
            disposition=Disposition.LIQUIDATE,
            rationale="D7: condition=USED_ACCEPTABLE -> LIQUIDATE.",
        )

    # Fallback safety net.
    return DispositionResult(
        disposition=Disposition.PENDING_REVIEW,
        rationale="D_fallback: no rule matched -> PENDING_REVIEW.",
    )
