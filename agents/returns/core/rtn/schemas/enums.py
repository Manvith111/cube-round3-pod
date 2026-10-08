"""Shared enums for RTN.

These are the fixed vocabularies used across the VLM output schema, the
policy engine, and the evidence record. Keeping them in one place prevents
drift between what the model is allowed to say and what the policy engine
expects to read.
"""

from __future__ import annotations

from enum import Enum


class IdentityVerdict(str, Enum):
    """Outcome of the identity check (returned item vs ordered SKU/ASIN)."""

    MATCH = "MATCH"
    NO_MATCH = "NO_MATCH"
    UNCERTAIN = "UNCERTAIN"


class PartStatus(str, Enum):
    """Per-component completeness status.

    MISSING and NOT_OBSERVED are deliberately distinct and must never be
    collapsed:
      - MISSING: the expected location/area for the part IS visible in the
        photos, and the part is clearly absent from it.
      - NOT_OBSERVED: the photos do not show enough of the item (occlusion,
        angle, cropping, blur) to determine whether the part is present.
    """

    PRESENT = "PRESENT"
    MISSING = "MISSING"
    NOT_OBSERVED = "NOT_OBSERVED"


class EvidenceQuality(str, Enum):
    """Quality of the visual evidence backing a check, independent of the
    model's confidence in its own answer.

    A model can be highly confident about a blurry photo and still be
    working from poor evidence — this field exists so that case is always
    visible to downstream policy and human reviewers, regardless of the
    confidence score reported alongside it.
    """

    GOOD = "GOOD"
    PARTIAL = "PARTIAL"
    POOR = "POOR"
    INSUFFICIENT = "INSUFFICIENT"


class AmazonCondition(str, Enum):
    """Amazon's authoritative resale condition categories.

    Source: Amazon "Marketplace Items Condition Guidelines" /
    "Amazon Resale: Understanding Product Conditions" (amazon.com Customer
    Service help pages, node IDs 202074290 / T7T34PC4e13psS1NjJ /
    TD36hbsFWCZlvThHpK). The full definitions used for prompting live in
    rtn/reference_data/amazon_condition_scale.json — this enum is only the
    label set. Never invented, never memorized by the model: the mapping
    from observations to one of these labels is computed by
    rtn/policy/condition_mapper.py from raw VLM observations.
    """

    NEW = "NEW"
    USED_LIKE_NEW = "USED_LIKE_NEW"
    USED_VERY_GOOD = "USED_VERY_GOOD"
    USED_GOOD = "USED_GOOD"
    USED_ACCEPTABLE = "USED_ACCEPTABLE"
    UNSELLABLE = "UNSELLABLE"  # below Acceptable: not an Amazon resale grade, an internal
    # bucket for "fails Acceptable's functional/safety floor" so disposition
    # rules have somewhere deterministic to route damaged-beyond-resale units.
    UNDETERMINED = "UNDETERMINED"  # evidence insufficient to grade


class Disposition(str, Enum):
    """Final routing decision. Always computed by deterministic rules —
    never returned by the VLM and never chosen directly by the model."""

    RESTOCK = "RESTOCK"
    REFURBISH = "REFURBISH"
    LIQUIDATE = "LIQUIDATE"
    DISPOSE = "DISPOSE"
    PENDING_REVIEW = "PENDING_REVIEW"


class SealStatus(str, Enum):
    SEALED = "SEALED"
    OPENED = "OPENED"
    TORN = "TORN"
    CRUSHED = "CRUSHED"
    MISSING_PACKAGING = "MISSING_PACKAGING"
    NOT_OBSERVED = "NOT_OBSERVED"


class UsageSignLevel(str, Enum):
    NONE = "NONE"
    LIGHT = "LIGHT"
    MODERATE = "MODERATE"
    HEAVY = "HEAVY"
    NOT_OBSERVED = "NOT_OBSERVED"


class StructuralDamageLevel(str, Enum):
    NONE = "NONE"
    MINOR = "MINOR"
    MODERATE = "MODERATE"
    SEVERE = "SEVERE"
    NOT_OBSERVED = "NOT_OBSERVED"


class CheckKey(str, Enum):
    IDENTITY = "identity"
    COMPLETENESS = "completeness"
    CONDITION = "condition"
    PACKAGING = "packaging"


class DecidedBy(str, Enum):
    POLICY_ENGINE = "POLICY_ENGINE"
    HUMAN_OVERRIDE = "HUMAN_OVERRIDE"


class RecordStatus(str, Enum):
    COMPLETE = "COMPLETE"
    PENDING = "PENDING"  # fail-open: model call failed/timed out, awaiting retry/human
    OVERRIDDEN = "OVERRIDDEN"
