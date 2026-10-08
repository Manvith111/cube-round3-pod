"""Evidence record persistence.

Day 1 implementation: append-only JSONL files, one per organization, under
EVIDENCE_STORE_DIR. This is intentionally simple but already enforces the
multi-tenant isolation requirement: every read/write is scoped by
organization_id, and there is no code path that reads across
organizations.

Swap `EvidenceStore` for a real DB-backed implementation later without
touching pipeline.py — callers only depend on this interface.
"""

from __future__ import annotations

import json
from pathlib import Path

from agents.returns.core.rtn.config import settings
from agents.returns.core.rtn.schemas.evidence import EvidenceRecord, Override


class EvidenceStore:
    def __init__(self, base_dir: Path | None = None) -> None:
        self._base_dir = base_dir or settings.evidence_store_dir
        self._base_dir.mkdir(parents=True, exist_ok=True)

    def _org_file(self, organization_id: str) -> Path:
        # One file per org enforces physical tenant separation, not just a
        # filter clause — org A's process never even opens org B's file.
        safe = organization_id.replace("/", "_").replace("..", "_")
        return self._base_dir / f"{safe}.jsonl"

    def write(self, record: EvidenceRecord) -> None:
        path = self._org_file(record.organization_id)
        with open(path, "a", encoding="utf-8") as f:
            f.write(record.model_dump_json() + "\n")

    def list_for_tenant(self, organization_id: str, client_id: str | None = None) -> list[EvidenceRecord]:
        """Always filtered by organization_id (and optionally client_id).
        There is no method on this class that returns records without an
        organization_id filter — that is the enforced isolation boundary.
        """
        path = self._org_file(organization_id)
        if not path.exists():
            return []
        records: list[EvidenceRecord] = []
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                record = EvidenceRecord.model_validate_json(line)
                if record.organization_id != organization_id:
                    # Defense in depth: should be impossible given the
                    # per-org file layout, but never trust a single layer.
                    continue
                if client_id is not None and record.client_id != client_id:
                    continue
                records.append(record)
        return records

    def get(self, organization_id: str, record_id: str) -> EvidenceRecord | None:
        for record in self.list_for_tenant(organization_id):
            if record.record_id == record_id:
                return record
        return None

    def append_override(
        self, organization_id: str, record_id: str, override: Override
    ) -> EvidenceRecord:
        """Overrides are captured as data: this rewrites the record with the
        override appended to `overrides[]`. The original check verdicts and
        outcome fields already written are NOT mutated — only `overrides`
        grows and `status` flips to OVERRIDDEN. Since Day 1 storage is
        append-only JSONL, applying an override means rewriting the file
        with all-but-the-target record replayed unchanged and the target
        record updated. This preserves full history for every other
        record while still capturing the override as an explicit,
        attributed data entry rather than a silent edit.
        """
        from agents.returns.core.rtn.schemas.enums import RecordStatus  # local import avoids cycle

        records = self.list_for_tenant(organization_id)
        path = self._org_file(organization_id)
        updated: EvidenceRecord | None = None
        with open(path, "w", encoding="utf-8") as f:
            for record in records:
                if record.record_id == record_id:
                    record.overrides.append(override)
                    record.status = RecordStatus.OVERRIDDEN
                    updated = record
                f.write(record.model_dump_json() + "\n")
        if updated is None:
            raise KeyError(f"record {record_id} not found for org {organization_id}")
        return updated
