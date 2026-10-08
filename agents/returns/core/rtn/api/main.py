"""Minimal FastAPI surface for the RTN pipeline.

Day 1 scope: one endpoint to evaluate a unit, one to fetch a record back by
id (tenant-scoped). No auth is implemented yet — see the note below.

SECURITY NOTE: this API has no authentication/authorization layer. The
tenant fields (organization_id/client_id) are accepted as request input,
which means a caller could currently claim any org. Multi-tenant isolation
at the storage layer is enforced (see rtn/audit/store.py), but callers must
not be trusted to self-report their own org/client in a real deployment —
that must come from an authenticated session/API key before this goes
anywhere near production traffic. Flagging explicitly since this is a
network-exposed service.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from agents.returns.core.rtn.audit.store import EvidenceStore
from agents.returns.core.rtn.config import settings
from agents.returns.core.rtn.pipeline import RTNPipeline
from agents.returns.core.rtn.schemas.evidence import EvidenceRecord
from agents.returns.core.rtn.schemas.input import ExpectedComponent, ImageInput, OrderInfo, UnitInput

app = FastAPI(title="RTN Returns Manager Agent", version="0.1.0")

_pipeline = RTNPipeline()
_store = EvidenceStore()

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
UPLOADS_DIR = REPO_ROOT / "data" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR = Path(__file__).resolve().parent / "static"

# Serve uploaded images back to the browser so the evidence viewer can
# display reference/returned photos alongside the verdicts.
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


@app.get("/")
def serve_frontend() -> FileResponse:
    return FileResponse(str(STATIC_DIR / "index.html"))


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.post("/units/evaluate", response_model=EvidenceRecord)
def evaluate_unit(unit: UnitInput) -> EvidenceRecord:
    return _pipeline.run_unit(unit)


@app.post("/units/evaluate-upload", response_model=EvidenceRecord)
async def evaluate_unit_upload(
    subject: str = Form(...),
    organization_id: str = Form(settings.default_organization_id),
    client_id: str = Form(settings.default_client_id),
    operator_label: str | None = Form(None),
    sku: str = Form(...),
    asin: str | None = Form(None),
    product_name: str = Form(...),
    product_description: str | None = Form(None),
    expected_components_json: str = Form("[]"),
    reference_files: list[UploadFile] = File(default_factory=list),
    returned_files: list[UploadFile] = File(default_factory=list),
) -> EvidenceRecord:
    """Accepts a multipart form from the browser (order fields + expected
    components as a JSON string + reference/returned image files), saves
    the images under data/uploads/<run_id>/, and runs the real pipeline
    (one batched VLM call) against them.
    """
    try:
        components_raw = json.loads(expected_components_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"invalid expected_components_json: {exc}") from exc

    if not reference_files and not returned_files:
        raise HTTPException(status_code=400, detail="at least one image file is required")

    run_id = str(uuid.uuid4())
    run_dir = UPLOADS_DIR / run_id
    (run_dir / "reference").mkdir(parents=True, exist_ok=True)
    (run_dir / "returned").mkdir(parents=True, exist_ok=True)

    images: list[ImageInput] = []
    for role, files in (("reference", reference_files), ("returned", returned_files)):
        for idx, upload in enumerate(files, start=1):
            if upload.filename is None:
                continue
            dest = run_dir / role / f"{idx:02d}_{Path(upload.filename).name}"
            data = await upload.read()
            dest.write_bytes(data)
            images.append(ImageInput(image_id=f"{role}_{idx}", role=role, path=str(dest)))

    unit = UnitInput(
        subject=subject,
        organization_id=organization_id,
        client_id=client_id,
        operator_label=operator_label,
        order=OrderInfo(
            sku=sku,
            asin=asin or None,
            product_name=product_name,
            product_description=product_description or None,
        ),
        expected_components=[ExpectedComponent(**c) for c in components_raw],
        images=images,
    )

    record = _pipeline.run_unit(unit)

    # The stored evidence record (already written to disk by the pipeline,
    # content_hash computed over it) keeps the real absolute filesystem
    # path for audit purposes. The API response substitutes a
    # browser-servable /uploads/... URL in its place purely for display —
    # this does not alter what was persisted.
    record_dict = record.model_dump(mode="json")
    for img in record_dict.get("images", []):
        path = Path(img["path_or_url"])
        try:
            rel = path.relative_to(UPLOADS_DIR)
            img["path_or_url"] = f"/uploads/{rel.as_posix()}"
        except ValueError:
            pass  # not an uploaded file (e.g. fixture path); leave as-is
    return record_dict


@app.get("/orgs/{organization_id}/records/{record_id}", response_model=EvidenceRecord)
def get_record(organization_id: str, record_id: str) -> EvidenceRecord:
    record = _store.get(organization_id, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="record not found")
    return record


@app.get("/orgs/{organization_id}/records", response_model=list[EvidenceRecord])
def list_records(organization_id: str, client_id: str | None = None) -> list[EvidenceRecord]:
    return _store.list_for_tenant(organization_id, client_id=client_id)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
