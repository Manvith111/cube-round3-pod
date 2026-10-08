"""Secondary fusion signal for the identity check (CLIP/SigLIP embedding
similarity between returned photo(s) and reference/catalogue image(s)).

Day 1 scope: stubbed with a clean interface so the pipeline and the
uncertainty gate can be wired against it now. Day 4 fills in a real
open_clip / SigLIP forward pass (see pyproject.toml's [fusion] extra).

Design constraint from the spec: this signal is NOT trained, and it is
never a replacement for the VLM's identity verdict — it only feeds the
identity check as a supporting/disagreement signal.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class FusionSignal:
    available: bool
    similarity: float | None  # cosine similarity in [-1, 1], None if unavailable
    reason: str | None = None  # why unavailable, if so


class EmbeddingFusion:
    """Interface kept stable across Day 1 -> Day 4. Day 1 returns
    available=False so downstream uncertainty-gate logic must already
    handle "no fusion signal" without crashing; Day 4 swaps in a real
    model without changing callers.
    """

    def similarity(self, reference_image_paths: list[str], returned_image_paths: list[str]) -> FusionSignal:
        return FusionSignal(
            available=False,
            similarity=None,
            reason="fusion model not yet wired (Day 4 scope)",
        )
