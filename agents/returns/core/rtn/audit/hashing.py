"""Content hashing for evidence records and images.

Two uses:
  1. Per-image content_hash (tamper-evidence, dedup) — computed from raw
     image bytes.
  2. Per-record content_hash — computed from the record's stable content
     (images + checks + outcome), so any post-hoc edit to a supposedly
     frozen record is detectable.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hash_file(path: str | Path) -> str:
    return hash_bytes(Path(path).read_bytes())


def hash_record_content(
    images: list[dict[str, Any]],
    checks: list[dict[str, Any]],
    outcome: dict[str, Any] | None,
) -> str:
    """Deterministic hash over the parts of an evidence record that should
    never change once written (excluding volatile fields like
    updated_at/overrides, which are expected to accumulate over time).
    """
    payload = {
        "images": images,
        "checks": checks,
        "outcome": outcome,
    }
    canonical = json.dumps(payload, sort_keys=True, default=str)
    return hash_bytes(canonical.encode("utf-8"))
