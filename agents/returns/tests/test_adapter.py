"""Adapter tests for the Returns Manager (agents/returns/app.py).

Run:  pytest agents/returns/tests
These are not in the Pod's `testpaths`, so `make test` does not collect them. They use no real images and no
real key. A fake VLM client stands in for the model. Tests that need the lazily-imported packages
(openai, pydantic-settings, tenacity) skip when those are missing.
"""
from __future__ import annotations

import pytest

import agents.returns.app as app
from shared.utils.hashing import verify
from shared.utils.schema import errors

ALPHA, BRAVO = "org_demo_alpha", "org_demo_bravo"
UNIT = "UNIT-0014"  # org_demo_alpha, has a Returns row
LAMP_PARTS = ("lamp", "usb cable", "manual")
INPUTS = [f"{UNIT}/returns/reference_1.jpg", f"{UNIT}/returns/returned_1.jpg"]


def request(org=ALPHA, unit=UNIT, inputs=None, previous=None, overrides=None, rid=None):
    wf = f"WF-{org}-{unit}"
    return {"schema_version": "1.0", "request_id": rid or f"{wf}:returns", "workflow_id": wf, "stage": "returns",
            "subject": {"org_id": org, "subject_id": unit, "route": "fba"}, "inputs": inputs or [],
            "previous_evidence": previous or [], "context": {"overrides": overrides or [], "case": {}}}


def captures(tmp_path, monkeypatch, names=("reference_1.jpg", "returned_1.jpg")):
    """Tiny fake photo files under INPUT_DIR/<unit>/returns/, as the orchestrator would discover them."""
    folder = tmp_path / UNIT / "returns"
    folder.mkdir(parents=True)
    for n in names:
        (folder / n).write_bytes(b"not-a-real-jpeg:" + n.encode())
    monkeypatch.setenv("INPUT_DIR", str(tmp_path))
    return [{"ref": f"{UNIT}/returns/{n}", "kind": "image", "sha256": None} for n in names]


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    monkeypatch.delenv("VLM_API_KEY", raising=False)
    monkeypatch.setattr(app, "_load_env", lambda: None)  # never read a real .env in tests


def assert_valid(out):
    assert errors("agent-output", out) == []
    assert verify(out["evidence"])


def assert_pending(out, code=None):
    assert_valid(out)
    assert out["status"] == "pending" and out["verdict"] == "UNCERTAIN"
    assert out["evidence"]["checks"] == [] and out["evidence"]["decision"]["needs_human"] is True
    if code:
        assert out["error"]["code"] == code


# ------------------------------------------------------------------------------------------------ tenancy
def test_wrong_tenant_is_refused():
    with pytest.raises(LookupError):
        app.handle(request(org=BRAVO))  # UNIT-0014 belongs to org_demo_alpha


def test_unknown_unit_is_refused():
    with pytest.raises(LookupError):
        app.handle(request(unit="UNIT-9999"))


def test_wrong_tenant_is_refused_even_with_photos(tmp_path, monkeypatch):
    with pytest.raises(LookupError):
        app.handle(request(org=BRAVO, inputs=captures(tmp_path, monkeypatch)))


# ------------------------------------------------------------------------------------------------ replay
def test_replay_is_labelled_and_valid():
    out = app.handle(request())
    assert_valid(out)
    ev = out["evidence"]
    assert ev["model"]["name"] == "csv-replay" and ev["model"]["calls"] == 0
    assert ev["payload"]["replay"] is True and ev["payload"]["condition_graded"] is False
    assert ev["payload"]["amazon_condition"] is None
    assert "not a judgment" in ev["decision"]["reason"]


def test_replay_same_request_same_record_id():
    assert app.handle(request())["evidence"]["record_id"] == app.handle(request())["evidence"]["record_id"]


def test_replay_uncertain_stays_uncertain(monkeypatch):
    row = dict(app.sample_data.row("returns", UNIT, ALPHA), identity_match="uncertain")
    monkeypatch.setattr(app.sample_data, "row", lambda *a, **k: row)
    out = app.handle(request())
    assert_valid(out)
    assert out["verdict"] == "UNCERTAIN"
    assert out["evidence"]["checks"][0]["verdict"] == "UNCERTAIN"
    assert out["evidence"]["checks"][0]["uncertain_reason"]


def test_replay_lists_upstream_and_applies_latest_override():
    prior = app.handle({**request(), "stage": "returns"})["evidence"]  # any valid record to use as "previous"
    prior = {**prior, "record_id": "PCK-0014", "stage": "pack"}
    ovr = [{"override_id": "OVR-001", "supersedes": {"record_id": "PCK-0014", "override_id": None}, "new_verdict": "FAIL"},
           {"override_id": "OVR-002", "supersedes": {"record_id": "PCK-0014", "override_id": "OVR-001"}, "new_verdict": "PASS"}]
    ev = app.handle(request(previous=[prior], overrides=ovr))["evidence"]
    assert ev["upstream_refs"] == ["PCK-0014"]
    assert ev["payload"]["upstream_considered"][0]["effective_verdict"] == "PASS"  # the LATEST override wins


# ------------------------------------------------------------------------------------------------ fail open
def test_photos_but_no_key_is_pending_not_a_replay(tmp_path, monkeypatch):
    out = app.handle(request(inputs=captures(tmp_path, monkeypatch)))
    assert_pending(out, "model_error")
    assert out["evidence"]["model"]["name"] != "csv-replay"


def test_forced_model_error_gives_pending(tmp_path, monkeypatch):
    monkeypatch.setenv("VLM_API_KEY", "test-key-not-real")

    class Boom:
        def run_unit(self, unit):
            raise RuntimeError("provider exploded")

    monkeypatch.setattr(app, "_build_pipeline", lambda: Boom())
    out = app.handle(request(inputs=captures(tmp_path, monkeypatch)))
    assert_pending(out, "model_error")
    assert "provider exploded" in out["error"]["message"]


@pytest.mark.parametrize("ref", [f"UNIT-0003/returns/returned_1.jpg", f"{UNIT}/../UNIT-0003/returns/returned_1.jpg",
                                 "/etc/passwd.jpg", "C:/Windows/x.jpg"])
def test_refs_outside_this_subject_are_never_read(ref, tmp_path, monkeypatch):
    monkeypatch.setenv("VLM_API_KEY", "test-key-not-real")
    monkeypatch.setenv("INPUT_DIR", str(tmp_path))
    out = app.handle(request(inputs=[{"ref": ref, "kind": "image", "sha256": None}]))
    assert_pending(out, "upstream_missing")


def test_unlabelled_or_incomplete_photos_are_pending(tmp_path, monkeypatch):
    monkeypatch.setenv("VLM_API_KEY", "test-key-not-real")
    only_returned = captures(tmp_path, monkeypatch, names=("returned_1.jpg",))
    assert_pending(app.handle(request(inputs=only_returned)), "upstream_missing")


# ------------------------------------------------------------------------------------------------ real path, fake model
def fake_pipeline(monkeypatch, identity="MATCH", quality="GOOD", seal="OPENED", usage="NONE", damage="NONE",
                  part_status="PRESENT"):
    pytest.importorskip("pydantic_settings")
    pytest.importorskip("openai")
    pytest.importorskip("tenacity")
    from agents.returns.core.rtn.perception.vlm_client import PerceptionResult
    from agents.returns.core.rtn.pipeline import RTNPipeline
    from agents.returns.core.rtn.schemas import enums as e
    from agents.returns.core.rtn.schemas import vlm_output as v

    resp = v.VLMResponse(
        identity=v.IdentityObservation(verdict=e.IdentityVerdict(identity), evidence_quality=e.EvidenceQuality(quality),
                                       confidence=0.8, detail="fake identity"),
        completeness=[v.ComponentObservation(part_name=p, status=e.PartStatus(part_status),
                                             evidence_quality=e.EvidenceQuality(quality), confidence=0.8, detail="fake")
                      for p in LAMP_PARTS],
        condition=v.ConditionObservation(
            seal_status=e.SealStatus(seal), packaging_state_detail="fake", usage_signs=e.UsageSignLevel(usage),
            usage_signs_detail="fake", structural_damage=e.StructuralDamageLevel(damage),
            structural_damage_detail="fake", evidence_quality=e.EvidenceQuality(quality), confidence=0.8))

    class FakeVLM:
        calls = 0

        def evaluate_unit(self, unit):
            FakeVLM.calls += 1
            return PerceptionResult(ok=True, response=resp, model_version="fake-vlm", latency_ms=7)

    monkeypatch.setenv("VLM_API_KEY", "test-key-not-real")
    monkeypatch.setattr(app, "_build_pipeline", lambda: RTNPipeline(vlm_client=FakeVLM(), store=app._NoStore()))
    return FakeVLM


def test_real_path_clean_return_is_restock(tmp_path, monkeypatch):
    vlm = fake_pipeline(monkeypatch)
    out = app.handle(request(inputs=captures(tmp_path, monkeypatch)))
    assert_valid(out)
    ev = out["evidence"]
    assert vlm.calls == 1 and ev["model"]["calls"] == 1 and ev["model"]["cost_usd"] is None
    assert ev["model"]["name"] == "fake-vlm"
    assert [c["check_key"] for c in ev["checks"]] == ["identity_match", "completeness", "condition"]
    assert out["verdict"] == "PASS" and ev["decision"]["outcome"] == "restock"
    assert ev["payload"]["amazon_condition"] == "USED_LIKE_NEW" and ev["payload"]["condition_graded"] is True
    assert "provisional" in ev["payload"]["condition_mapping_status"]
    assert {i["ref"] for i in ev["inputs"]} == set(INPUTS) and all(len(i["sha256"]) == 64 for i in ev["inputs"])
    assert all(set(c["evidence_refs"]) <= set(INPUTS) for c in ev["checks"])
    assert ev["payload"]["rule_source"]["urls"]


def test_real_path_uncertain_identity_stays_uncertain(tmp_path, monkeypatch):
    fake_pipeline(monkeypatch, identity="UNCERTAIN")
    out = app.handle(request(inputs=captures(tmp_path, monkeypatch)))
    assert_valid(out)
    ev = out["evidence"]
    assert ev["checks"][0]["verdict"] == "UNCERTAIN" and ev["checks"][0]["uncertain_reason"]
    assert out["verdict"] == "UNCERTAIN" and ev["decision"]["outcome"] == "pending_review"
    assert ev["decision"]["needs_human"] is True


def test_real_path_wrong_item_fails_identity_and_goes_to_a_person(tmp_path, monkeypatch):
    fake_pipeline(monkeypatch, identity="NO_MATCH")
    out = app.handle(request(inputs=captures(tmp_path, monkeypatch)))
    assert_valid(out)
    assert out["evidence"]["checks"][0]["verdict"] == "FAIL"
    assert out["verdict"] == "FAIL" and out["evidence"]["decision"]["outcome"] == "pending_review"
    assert out["evidence"]["decision"]["needs_human"] is True


def test_real_path_poor_evidence_is_never_graded(tmp_path, monkeypatch):
    fake_pipeline(monkeypatch, quality="POOR")
    out = app.handle(request(inputs=captures(tmp_path, monkeypatch)))
    assert_valid(out)
    by = {c["check_key"]: c for c in out["evidence"]["checks"]}
    assert by["condition"]["verdict"] == "UNCERTAIN" and by["condition"]["uncertain_reason"] == "poor_image"
    assert out["evidence"]["payload"]["amazon_condition"] == "UNDETERMINED"
    assert out["evidence"]["payload"]["condition_graded"] is False
    assert out["verdict"] == "UNCERTAIN"


def test_real_path_missing_part_is_incomplete(tmp_path, monkeypatch):
    fake_pipeline(monkeypatch, part_status="MISSING")
    out = app.handle(request(inputs=captures(tmp_path, monkeypatch)))
    assert_valid(out)
    by = {c["check_key"]: c for c in out["evidence"]["checks"]}
    assert by["completeness"]["verdict"] == "FAIL"
    assert sorted(out["evidence"]["payload"]["parts_missing"]) == sorted(LAMP_PARTS)
    assert out["evidence"]["decision"]["outcome"] in {"dispose", "liquidate", "refurbish", "pending_review"}
    assert out["evidence"]["decision"]["outcome"] == out["evidence"]["decision"]["outcome"].lower()


def test_real_path_unsellable_is_not_a_fail(tmp_path, monkeypatch):
    fake_pipeline(monkeypatch, damage="SEVERE")
    out = app.handle(request(inputs=captures(tmp_path, monkeypatch)))
    assert_valid(out)
    by = {c["check_key"]: c for c in out["evidence"]["checks"]}
    assert out["evidence"]["payload"]["amazon_condition"] == "UNSELLABLE"
    assert by["condition"]["verdict"] == "PASS"  # graded; provisional mapping, see INTEGRATION-NOTES.md
