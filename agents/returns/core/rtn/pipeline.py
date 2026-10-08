"""End-to-end orchestration for one unit: Input -> Perception -> Uncertainty
-> Policy -> Audit.

This is the single place that wires the layers together. Day 1 scope: one
unit, synchronous, no batching across units.
"""

from __future__ import annotations

from agents.returns.core.rtn.audit.hashing import hash_file, hash_record_content
from agents.returns.core.rtn.audit.store import EvidenceStore
from agents.returns.core.rtn.perception.fusion import EmbeddingFusion
from agents.returns.core.rtn.perception.vlm_client import VLMClient
from agents.returns.core.rtn.policy.completeness import gate_completeness
from agents.returns.core.rtn.policy.condition_mapper import map_condition
from agents.returns.core.rtn.policy.disposition_rules import decide_disposition
from agents.returns.core.rtn.policy.uncertainty_gate import gate_identity
from agents.returns.core.rtn.schemas.enums import AmazonCondition, CheckKey, DecidedBy, RecordStatus
from agents.returns.core.rtn.schemas.evidence import Check, EvidenceRecord, ImageRef, Outcome
from agents.returns.core.rtn.schemas.input import UnitInput


class RTNPipeline:
    def __init__(
        self,
        vlm_client: VLMClient | None = None,
        fusion: EmbeddingFusion | None = None,
        store: EvidenceStore | None = None,
    ) -> None:
        self._vlm = vlm_client or VLMClient()
        self._fusion = fusion or EmbeddingFusion()
        self._store = store or EvidenceStore()

    def run_unit(self, unit: UnitInput) -> EvidenceRecord:
        image_refs = self._build_image_refs(unit)

        # --- Perception: exactly one batched VLM call for this unit ---
        perception = self._vlm.evaluate_unit(unit)

        if not perception.ok:
            # Fail open: preserve the input, write a PENDING record, never
            # drop the case or raise past this point.
            record = EvidenceRecord(
                organization_id=unit.organization_id,
                client_id=unit.client_id,
                subject=unit.subject,
                captured_at=unit.captured_at,
                operator_label=unit.operator_label,
                images=image_refs,
                checks=[],
                outcome=None,
                status=RecordStatus.PENDING,
                content_hash=hash_record_content(
                    [r.model_dump(mode="json") for r in image_refs], [], None
                ),
            )
            record.checks.append(
                Check(
                    check_key=CheckKey.IDENTITY,
                    verdict="PENDING",
                    confidence=0.0,
                    evidence_quality="INSUFFICIENT",
                    detail=f"VLM call failed, case preserved for retry/review: {perception.error}",
                    model_version=perception.model_version,
                    latency_ms=perception.latency_ms,
                    raw_observation={"error": perception.error},
                )
            )
            self._store.write(record)
            return record

        vlm = perception.response
        assert vlm is not None

        # --- Perception fusion signal (identity only) ---
        fusion_signal = self._fusion.similarity(
            reference_image_paths=[i.path for i in unit.reference_images()],
            returned_image_paths=[i.path for i in unit.returned_images()],
        )

        # --- Uncertainty gate ---
        gated_identity = gate_identity(vlm.identity, fusion_signal)
        completeness_result = gate_completeness(vlm.completeness)

        essential_missing = any(
            gp.status.value == "MISSING"
            and any(ec.part_name == gp.part_name and ec.essential for ec in unit.expected_components)
            for gp in completeness_result.parts
        )

        # --- Policy: condition mapping + disposition ---
        condition_result = map_condition(
            vlm.condition,
            completeness_summary=completeness_result.summary,
            essential_part_missing=essential_missing,
        )
        disposition_result = decide_disposition(
            identity_verdict=gated_identity.verdict,
            completeness_summary=completeness_result.summary,
            condition=condition_result.condition,
        )

        checks = [
            Check(
                check_key=CheckKey.IDENTITY,
                verdict=gated_identity.verdict.value,
                confidence=gated_identity.confidence,
                evidence_quality=gated_identity.evidence_quality,
                detail=gated_identity.reason + " | VLM: " + vlm.identity.detail,
                model_version=perception.model_version,
                latency_ms=perception.latency_ms,
                raw_observation=vlm.identity.model_dump(mode="json"),
                fusion_signals=gated_identity.fusion_signals,
            ),
            Check(
                check_key=CheckKey.COMPLETENESS,
                verdict=completeness_result.summary,
                confidence=completeness_result.min_confidence,
                evidence_quality=completeness_result.worst_evidence_quality,
                detail="; ".join(
                    f"{p.part_name}={p.status.value} ({p.reason})" for p in completeness_result.parts
                ),
                model_version=perception.model_version,
                latency_ms=perception.latency_ms,
                raw_observation={"parts": [c.model_dump(mode="json") for c in vlm.completeness]},
            ),
            Check(
                check_key=CheckKey.CONDITION,
                verdict=condition_result.condition.value,
                confidence=vlm.condition.confidence,
                evidence_quality=vlm.condition.evidence_quality,
                detail=condition_result.rationale + " | VLM signals: "
                f"seal={vlm.condition.seal_status.value}, usage={vlm.condition.usage_signs.value}, "
                f"structural={vlm.condition.structural_damage.value}",
                model_version=perception.model_version,
                latency_ms=perception.latency_ms,
                raw_observation=vlm.condition.model_dump(mode="json"),
            ),
            Check(
                check_key=CheckKey.PACKAGING,
                verdict=vlm.condition.seal_status.value,
                confidence=vlm.condition.confidence,
                evidence_quality=vlm.condition.evidence_quality,
                detail=vlm.condition.packaging_state_detail,
                model_version=perception.model_version,
                latency_ms=perception.latency_ms,
                raw_observation={
                    "seal_status": vlm.condition.seal_status.value,
                    "packaging_state_detail": vlm.condition.packaging_state_detail,
                },
            ),
        ]

        outcome = Outcome(
            identity_verdict=gated_identity.verdict.value,
            completeness_summary=completeness_result.summary,
            amazon_condition=condition_result.condition,
            disposition=disposition_result.disposition,
            decided_by=DecidedBy.POLICY_ENGINE,
            rationale=disposition_result.rationale + " | condition rule: " + condition_result.rationale,
        )

        checks_dump = [c.model_dump(mode="json") for c in checks]
        images_dump = [r.model_dump(mode="json") for r in image_refs]
        outcome_dump = outcome.model_dump(mode="json")

        record = EvidenceRecord(
            organization_id=unit.organization_id,
            client_id=unit.client_id,
            subject=unit.subject,
            captured_at=unit.captured_at,
            operator_label=unit.operator_label,
            images=image_refs,
            checks=checks,
            outcome=outcome,
            status=RecordStatus.COMPLETE,
            content_hash=hash_record_content(images_dump, checks_dump, outcome_dump),
        )

        self._store.write(record)
        return record

    @staticmethod
    def _build_image_refs(unit: UnitInput) -> list[ImageRef]:
        refs = []
        for img in unit.images:
            refs.append(
                ImageRef(
                    image_id=img.image_id,
                    role=img.role,
                    path_or_url=img.path,
                    content_hash=hash_file(img.path),
                )
            )
        return refs
