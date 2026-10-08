"""Input-layer schemas: what a caller must supply to evaluate one unit.

This is the "Input" layer of Input -> Perception -> Uncertainty -> Policy ->
Audit. Everything the VLM is allowed to see for this unit is assembled from
exactly this object plus the retrieved reference_data condition scale doc —
nothing else is injected into the prompt.
"""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field


class ImageInput(BaseModel):
    image_id: str
    role: str = Field(description="'reference' or 'returned'")
    path: str = Field(description="Local filesystem path to the image file.")


class OrderInfo(BaseModel):
    sku: str
    asin: str | None = None
    product_name: str
    product_description: str | None = None


class ExpectedComponent(BaseModel):
    part_name: str
    description: str | None = None
    essential: bool = Field(
        default=True,
        description="Whether this part is essential for the item's core "
        "function. Non-essential missing parts weigh differently in the "
        "completeness->condition mapping than essential ones.",
    )


class UnitInput(BaseModel):
    """Everything needed to run one unit through the pipeline."""

    subject: str = Field(description="Return/RMA identifier for this unit.")
    organization_id: str
    client_id: str
    captured_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    operator_label: str | None = None

    order: OrderInfo
    expected_components: list[ExpectedComponent] = Field(default_factory=list)
    images: list[ImageInput] = Field(default_factory=list)

    def reference_images(self) -> list[ImageInput]:
        return [i for i in self.images if i.role == "reference"]

    def returned_images(self) -> list[ImageInput]:
        return [i for i in self.images if i.role == "returned"]
