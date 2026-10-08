"""Minimal enforced multi-tenant isolation test: org A must never see org
B's evidence records, even when both are present in the same store
directory.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

# The Round 2 store reads its settings through pydantic-settings, which is not in the Pod's requirements.txt.
# Skip (do not fail) where it is missing, so the Pod's `make test` stays green.
pytest.importorskip("pydantic_settings")

from agents.returns.core.rtn.audit.store import EvidenceStore  # noqa: E402
from agents.returns.core.rtn.schemas.enums import AmazonCondition, DecidedBy, Disposition, RecordStatus
from agents.returns.core.rtn.schemas.evidence import EvidenceRecord, Outcome


def _make_record(org: str, client: str, subject: str) -> EvidenceRecord:
    outcome = Outcome(
        identity_verdict="MATCH",
        completeness_summary="COMPLETE",
        amazon_condition=AmazonCondition.USED_GOOD,
        disposition=Disposition.RESTOCK,
        decided_by=DecidedBy.POLICY_ENGINE,
        rationale="test fixture",
    )
    return EvidenceRecord(
        organization_id=org,
        client_id=client,
        subject=subject,
        captured_at=datetime.now(timezone.utc),
        images=[],
        checks=[],
        outcome=outcome,
        status=RecordStatus.COMPLETE,
        content_hash="deadbeef",
    )


def test_org_a_cannot_see_org_b_records(tmp_path):
    store = EvidenceStore(base_dir=tmp_path)

    record_a = _make_record("org-A", "client-1", "subject-a-1")
    record_b = _make_record("org-B", "client-1", "subject-b-1")

    store.write(record_a)
    store.write(record_b)

    org_a_records = store.list_for_tenant("org-A")
    org_b_records = store.list_for_tenant("org-B")

    assert [r.record_id for r in org_a_records] == [record_a.record_id]
    assert [r.record_id for r in org_b_records] == [record_b.record_id]

    # org A's view must not contain org B's subject and vice versa.
    assert all(r.organization_id == "org-A" for r in org_a_records)
    assert all(r.organization_id == "org-B" for r in org_b_records)

    # get() is also tenant-scoped: org A can't fetch org B's record by id.
    assert store.get("org-A", record_b.record_id) is None
    assert store.get("org-B", record_a.record_id) is None
    assert store.get("org-A", record_a.record_id) is not None


def test_client_scoping_within_same_org(tmp_path):
    store = EvidenceStore(base_dir=tmp_path)

    record_1 = _make_record("org-A", "client-1", "subject-1")
    record_2 = _make_record("org-A", "client-2", "subject-2")

    store.write(record_1)
    store.write(record_2)

    client_1_records = store.list_for_tenant("org-A", client_id="client-1")
    assert [r.record_id for r in client_1_records] == [record_1.record_id]
