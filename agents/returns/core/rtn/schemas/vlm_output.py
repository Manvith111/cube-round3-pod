"""The VLM's structured output contract.

This schema is deliberately observation-only. The model may report what it
sees and how confident/well-evidenced that observation is. It may NOT
report an Amazon condition category or a disposition — those fields do not
exist here on purpose. Mapping raw observations to Amazon condition and
disposition happens exclusively in rtn/policy/, never inside this schema or
inside the model call.

This is the JSON shape we force the model to produce (e.g. via
response_format / tool-call structured output), and the shape we validate
the raw model response against before anything downstream touches it.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from agents.returns.core.rtn.schemas.enums import (
    EvidenceQuality,
    IdentityVerdict,
    PartStatus,
    SealStatus,
    StructuralDamageLevel,
    UsageSignLevel,
)


class BoundingHint(BaseModel):
    """Optional coarse location hint for a visual observation, e.g. which
    input image and roughly where in it the model is pointing. Not a
    pixel-precise bounding box — this is a general-purpose VLM, not an
    object detector, and we don't want the model to fabricate precision it
    doesn't have."""

    model_config = {"extra": "forbid"}

    image_ref: str = Field(
        description="Identifier of the image this observation refers to, "
        "e.g. 'returned_1' or 'reference_2'. Must be one of the image refs "
        "provided in the prompt."
    )
    region_note: str | None = Field(
        default=None,
        description="Short free-text location description, e.g. 'bottom-left "
        "corner of the box' or 'lid area'. Omit if not applicable.",
    )


class IdentityObservation(BaseModel):
    """Raw observations supporting the identity check. The model reports
    what matches or differs; it does NOT output a final MATCH/NO_MATCH
    decision that bypasses evidence — the verdict field below is the
    model's own read, but it is treated as one signal among several
    (see rtn/policy/uncertainty_gate.py for fusion with the CLIP/SigLIP
    similarity signal)."""

    model_config = {"extra": "forbid"}

    verdict: IdentityVerdict
    matching_attributes: list[str] = Field(
        default_factory=list,
        description="Visible attributes that match the reference/catalogue "
        "images (e.g. 'same bottle shape', 'same label color').",
    )
    conflicting_attributes: list[str] = Field(
        default_factory=list,
        description="Visible attributes that conflict with the reference "
        "images (e.g. 'different cap color', 'different logo').",
    )
    evidence_quality: EvidenceQuality
    confidence: float = Field(ge=0.0, le=1.0)
    detail: str = Field(
        description="Plain-language explanation citing specific visual evidence."
    )
    bounding_hints: list[BoundingHint] = Field(default_factory=list)


class ComponentObservation(BaseModel):
    """Per-expected-part completeness observation."""

    model_config = {"extra": "forbid"}

    part_name: str
    status: PartStatus
    evidence_quality: EvidenceQuality
    confidence: float = Field(ge=0.0, le=1.0)
    detail: str = Field(
        description="Why this status was chosen. If MISSING, must describe "
        "the expected location that was visible but empty. If "
        "NOT_OBSERVED, must describe what obstructed the view (angle, "
        "occlusion, cropping, blur, not photographed)."
    )
    bounding_hints: list[BoundingHint] = Field(default_factory=list)

    @field_validator("detail")
    @classmethod
    def _detail_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("detail must not be empty")
        return v


class ConditionObservation(BaseModel):
    """Raw, un-graded condition observations. This is deliberately NOT an
    Amazon condition label. It is the set of primitive visual signals that
    rtn/policy/condition_mapper.py consumes to compute one."""

    model_config = {"extra": "forbid"}

    seal_status: SealStatus
    packaging_state_detail: str = Field(
        description="Free-text description of packaging state observed."
    )
    usage_signs: UsageSignLevel
    usage_signs_detail: str = Field(
        description="Specific signs of use observed (scratches, scuffs, "
        "discoloration, odor cues if described in listing text, etc.), or "
        "explanation if NOT_OBSERVED."
    )
    structural_damage: StructuralDamageLevel
    structural_damage_detail: str = Field(
        description="Specific structural/functional damage observed (cracks, "
        "dents, broken parts, missing functional components), or "
        "explanation if NOT_OBSERVED."
    )
    functional_signs_positive: list[str] = Field(
        default_factory=list,
        description="Visible signs suggesting the item still functions "
        "(e.g. 'display powers on in photo', 'no visible cracks in housing').",
    )
    functional_signs_negative: list[str] = Field(
        default_factory=list,
        description="Visible signs suggesting functional failure (e.g. "
        "'cracked screen', 'battery compartment corroded').",
    )
    evidence_quality: EvidenceQuality
    confidence: float = Field(ge=0.0, le=1.0)
    bounding_hints: list[BoundingHint] = Field(default_factory=list)


class VLMCheck(BaseModel):
    """Wrapper matching one row of the eventual evidence record's checks[]
    for a given check_key, but still in raw-observation form. Kept generic
    so the same envelope carries identity/completeness/condition payloads
    without forcing them into a lowest-common-denominator shape."""

    model_config = {"extra": "forbid"}


class VLMResponse(BaseModel):
    """Top-level structured output the VLM must return for one unit, in one
    batched call. Forced via response_format=json_schema (or equivalent) at
    the provider layer.
    """

    model_config = {"extra": "forbid"}

    schema_version: str = Field(default="1.0")
    identity: IdentityObservation
    completeness: list[ComponentObservation] = Field(
        description="One entry per expected component that was provided in "
        "the prompt's expected_components list. Every expected component "
        "must appear exactly once."
    )
    condition: ConditionObservation
    overall_notes: str | None = Field(
        default=None,
        description="Optional short free-text summary of anything unusual "
        "not captured above. Must not contain a condition-scale label or "
        "disposition recommendation — those are computed downstream.",
    )

    @field_validator("overall_notes")
    @classmethod
    def _no_forbidden_terms(cls, v: str | None) -> str | None:
        if v is None:
            return v
        forbidden = [
            "restock",
            "refurbish",
            "liquidate",
            "dispose",
            "like new",
            "very good",
            "acceptable",
            "used - good",
        ]
        lowered = v.lower()
        hit = next((term for term in forbidden if term in lowered), None)
        if hit:
            raise ValueError(
                f"overall_notes must not contain condition/disposition "
                f"language ('{hit}') — the VLM must only report "
                f"observations, never decide condition or disposition."
            )
        return v
