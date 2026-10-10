"""Pod test UI server.   python -m ui.server   ->   http://127.0.0.1:8200

Local test harness only: it binds to 127.0.0.1 and has NO authentication. Do not expose it.
It calls the existing orchestrator (ui/runner.py) and shows exactly what came back. It reads no API keys.
"""
from __future__ import annotations

import base64
import binascii
import os
import threading
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from orchestration.clients import load_manifest
from orchestration.orchestrator import discover_inputs, load_flow
from orchestration.store import EvidenceConflict

from . import captures, envfile, runner, trace_view

ENV_LOADED = envfile.load()  # names only; values are never printed or returned
ENV_ALIASES = envfile.apply_model_aliases()
UI_DIR = Path(__file__).resolve().parent
HOST = "127.0.0.1"  # fixed on purpose: the copy-from-path endpoint reads local files
PORT = int(os.environ.get("UI_PORT", "8200"))

app = FastAPI(title="CUBE Pod test UI")
app.mount("/static", StaticFiles(directory=UI_DIR / "static"), name="static")
# Pages being tried out live in ui/experiments/ and open at http://127.0.0.1:8200/experiments/<file>.
# Same origin as the API, so they can call /api/... without extra setup. Only that folder is served.
(UI_DIR / "experiments").mkdir(exist_ok=True)
app.mount("/experiments", StaticFiles(directory=UI_DIR / "experiments", html=True), name="experiments")


@app.middleware("http")
async def same_origin_only(request: Request, call_next):
    """Refuse cross-site writes: another web page must not be able to drive this local server."""
    if request.method == "POST":
        origin = request.headers.get("origin")
        allowed = {f"http://{HOST}:{PORT}", f"http://localhost:{PORT}"}
        if origin and origin not in allowed:
            return JSONResponse({"detail": f"origin {origin} not allowed"}, status_code=403)
        if not request.headers.get("content-type", "").startswith("application/json"):
            return JSONResponse({"detail": "content-type must be application/json"}, status_code=415)
    return await call_next(request)


def _bad(exc: Exception) -> HTTPException:
    return HTTPException(422, str(exc))


@app.get("/")
def index() -> FileResponse:
    return FileResponse(UI_DIR / "static" / "index.html")


@app.get("/api/meta")
def meta() -> dict:
    flow = load_flow(runner.flow_path())
    agents = {}
    for st in captures.STAGES:
        try:
            m = load_manifest(st)
            agents[st] = {k: m.get(k) for k in ("agent_id", "mode", "implementation", "url", "module")}
        except FileNotFoundError:
            agents[st] = None
    return {"stages": list(captures.STAGES), "orgs": list(captures.ORGS), "flow_file": str(runner.flow_path()),
            "flow": flow, "agents": agents, "input_root": str(captures.input_root()),
            "naming": {st: {"rule": captures.RULES[st],
                            "roles": [{"role": r, "label": captures.ROLE_LABELS[r], "prefix": p}
                                      for r, p in captures.ROLES[st].items()]} for st in captures.STAGES},
            "image_exts": list(captures.IMAGE_EXTS), "alone_note": runner.ALONE_NOTE,
            "single_label": runner.SINGLE_LABEL, "replay_banner": runner.REPLAY_BANNER}


@app.get("/api/case")
def case(org: str, unit: str) -> dict:
    try:
        org, unit = captures.check_org(org), captures.check_unit(unit)
    except captures.CaptureError as exc:
        raise _bad(exc) from exc
    return {"case": runner.build_case(org, unit), "returns_pairs": runner.returns_pairs(unit),
            "how": "route and returned come from the sample data, exactly as orchestration/api.py builds a case",
            "captures": {st: {"folder": str(captures.stage_dir(unit, st)),
                              "orchestrator_would_send": discover_inputs(unit, st)} for st in captures.STAGES}}


@app.post("/api/captures/upload")
def upload(body: dict) -> dict:
    try:
        unit, stage = captures.check_unit(body.get("unit", "")), captures.check_stage(body.get("stage", ""))
    except captures.CaptureError as exc:
        raise _bad(exc) from exc
    results, problems = [], []
    with runner.LOCK:
        for item in body.get("items") or []:
            name = str(item.get("filename") or "")
            try:
                data = base64.b64decode(item.get("data_b64") or "", validate=True)
                results.append(captures.save(unit, stage, item.get("role", ""), name, data, source=f"upload:{name}"))
            except (captures.CaptureError, binascii.Error) as exc:
                problems.append({"source": name, "error": str(exc)})
    return {"saved": results, "errors": problems, "folder": str(captures.stage_dir(unit, stage)),
            "orchestrator_would_send": discover_inputs(unit, stage)}


@app.post("/api/captures/copy")
def copy_paths(body: dict) -> dict:
    try:
        unit, stage = captures.check_unit(body.get("unit", "")), captures.check_stage(body.get("stage", ""))
    except captures.CaptureError as exc:
        raise _bad(exc) from exc
    results, problems = [], []
    with runner.LOCK:
        for item in body.get("items") or []:
            path = str(item.get("path") or "")
            try:
                results.append(captures.copy_from_path(unit, stage, item.get("role", ""), path))
            except (captures.CaptureError, OSError) as exc:
                problems.append({"source": path, "error": str(exc)})
    return {"saved": results, "errors": problems, "folder": str(captures.stage_dir(unit, stage)),
            "orchestrator_would_send": discover_inputs(unit, stage)}


@app.post("/api/captures/delete")
def delete_captures(body: dict) -> dict:
    """Remove images from one unit's stage folder: the named ones, or all of them when `names` is left out.
    Refused while a run is in progress (a run reads those files)."""
    try:
        unit, stage = captures.check_unit(body.get("unit", "")), captures.check_stage(body.get("stage", ""))
        names = body.get("names")
        if not runner.LOCK.acquire(blocking=False):
            raise HTTPException(409, "A run is in progress. Try again when it has finished.")
        try:
            removed = captures.delete(unit, stage, names)
        finally:
            runner.LOCK.release()
    except captures.CaptureError as exc:
        raise _bad(exc) from exc
    return {"removed": removed, "folder": str(captures.stage_dir(unit, stage)),
            "orchestrator_would_send": discover_inputs(unit, stage)}


@app.get("/api/capture-file")
def capture_file(ref: str) -> FileResponse:
    try:
        return FileResponse(captures.resolve_ref(ref))
    except captures.CaptureError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/api/run")
def run(body: dict) -> dict:
    try:
        return runner.execute(body.get("mode", ""), body.get("stage", ""), body.get("org_id", ""),
                              body.get("unit_id", ""), body.get("test") or None, body.get("pair"),
                              custom=body.get("custom") or None)
    except captures.CaptureError as exc:
        raise _bad(exc) from exc


LIVE: dict[str, dict] = {}        # run_id -> {"events": [...], "done": bool, "result": ..., "error": ...}
LIVE_LOCK = threading.Lock()
LIVE_KEEP = 30


def _worker(run_id: str, args: tuple, case_overrides: dict | None = None, custom: dict | None = None) -> None:
    state = LIVE[run_id]

    def on_event(event: dict) -> None:
        with LIVE_LOCK:
            state["events"].append({"n": len(state["events"]), "at": time.time(), **event})

    try:
        state["result"] = runner.execute(*args, run_id=run_id, on_event=on_event, case_overrides=case_overrides,
                                         custom=custom)
    except Exception as exc:  # noqa: BLE001 - shown to the user as the run's error, never swallowed
        state["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        state["done"] = True


@app.post("/api/run/start")
def run_start(body: dict) -> dict:
    """Start a run in the background and return at once. Follow it with GET /api/run/{id}/progress."""
    args = (body.get("mode", ""), body.get("stage", ""), body.get("org_id", ""), body.get("unit_id", ""),
            body.get("test") or None, body.get("pair"))
    overrides = body.get("case") or None  # optional {route, returned}, for units that are not in the sample data
    custom = body.get("custom") or None   # optional custom case: the user's own expected values (see runner.build_custom)
    try:
        mode, stage, org, unit = runner.validate(*args)
        if custom is not None:
            case, _rows, _clean = runner.build_custom(org, unit, mode, stage, custom, body.get("test") or None)
        else:
            case = runner.build_case(org, unit, overrides)
    except captures.CaptureError as exc:
        raise _bad(exc) from exc
    flow = load_flow(runner.flow_path())
    run_id = runner.new_run_id()
    with LIVE_LOCK:
        for old in list(LIVE)[:-LIVE_KEEP]:
            if LIVE[old]["done"]:
                del LIVE[old]
        LIVE[run_id] = {"events": [], "done": False, "result": None, "error": None}
    threading.Thread(target=_worker, args=(run_id, args, overrides, custom), daemon=True).start()
    # `plan` lets a screen draw every stage up front (which will run, which are skipped and why).
    return {"run_id": run_id, "case": case, "plan": trace_view.plan(flow, case) if mode == "full" else None}


@app.get("/api/run/{run_id}/progress")
def run_progress(run_id: str, after: int = 0) -> dict:
    state = LIVE.get(run_id)
    if state is None:
        raise HTTPException(404, f"no live run {run_id}")
    with LIVE_LOCK:
        events = state["events"][max(after, 0):]
        nxt = len(state["events"])
    done = state["done"]
    trace = None
    if done and state["result"] is not None and state["result"]["request"]["mode"] == "full":
        trace = trace_view.trace(runner.load_run(run_id))
    return {"events": events, "next": nxt, "done": done,
            "result": state["result"] if done else None, "error": state["error"] if done else None, "trace": trace}


@app.get("/api/cases")
def cases() -> dict:
    return {"cases": trace_view.cases()}


@app.get("/api/runs")
def list_runs() -> dict:
    """Recent full-workflow runs, newest first, each with its trace (what the pipeline page loads from history)."""
    return {"history": trace_view.list_runs()}


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> dict:
    try:
        return runner.describe(runner.load_run(run_id))
    except KeyError as exc:
        raise HTTPException(404, f"no run {run_id}") from exc


@app.post("/api/runs/{run_id}/override")
def override(run_id: str, body: dict) -> dict:
    try:
        return runner.override(run_id, body)
    except KeyError as exc:
        raise HTTPException(404, f"not found: {exc}") from exc
    except (ValueError, EvidenceConflict) as exc:
        raise _bad(exc) from exc


# --------------------------------------------------------------------------
# Deployment-friendly endpoints consumed by the Next.js `web/` frontend.
# These run the real orchestrator in-process (no child-process spawn) so the
# frontend works both locally and on serverless hosts (Vercel) by calling the
# backend service over HTTP via POD_BACKEND_URL.
# --------------------------------------------------------------------------
from orchestration.orchestrator import bundle as _bundle  # noqa: E402
from orchestration.orchestrator import default_flow_path as _default_flow_path  # noqa: E402
from orchestration.orchestrator import run_workflow as _run_workflow  # noqa: E402
from orchestration.store import FileStore as _FileStore  # noqa: E402
from shared.utils import sample_data as _sample_data  # noqa: E402


def _pipeline_cases_preview() -> list[dict]:
    cases_path = _sample_data.data_dir() / "cases.json"
    import json as _json
    cases = _json.loads(cases_path.read_text(encoding="utf-8"))

    def units(kind: str) -> set[str]:
        return {r["unit_id"] for r in _sample_data.rows(kind)}

    pack_u, prep_u, ret_u = units("pack"), units("prep"), units("returns")
    out = []
    for c in cases:
        route = c.get("route") or "unknown"
        returned = bool(c.get("returned"))
        out.append({
            "unit_id": c["unit_id"], "org_id": c["org_id"], "route": route, "returned": returned,
            "has_pack": c["unit_id"] in pack_u, "has_prep": c["unit_id"] in prep_u,
            "has_returns": c["unit_id"] in ret_u,
            "label": f"{c['unit_id']} [{route.upper()}{' + RETURN' if returned else ''}] • {c['org_id']}",
        })
    return out


@app.get("/api/pipeline-cases")
def pipeline_cases() -> dict:
    try:
        return {"cases": _pipeline_cases_preview()}
    except Exception as exc:  # noqa: BLE001 - surfaced to the frontend
        raise _bad(exc) from exc


@app.post("/api/pipeline-run")
def pipeline_run(body: dict) -> dict:
    """Run the full workflow for one unit and return {workflow, evidence, case, raw_inputs}."""
    unit_id = body.get("unit_id") or "UNIT-0006"
    org_id = body.get("org_id") or "org_demo_bravo"
    custom = body.get("custom_payload") or {}

    def _one(kind: str) -> dict | None:
        try:
            return dict(_sample_data.row(kind, unit_id, org_id))
        except LookupError:
            return None

    raw_inputs = {
        "receiving": _one("receiving"), "prep": _one("prep"), "pack": _one("pack"),
        "returns": _one("returns"), "fees": _sample_data.fee_lines(unit_id, org_id),
    }

    req_route = custom.get("route")
    req_returned = custom.get("returned")
    route = req_route or _sample_data.route(unit_id, org_id)
    returned = req_returned if isinstance(req_returned, bool) else _sample_data.has("returns", unit_id, org_id)
    case = {"org_id": org_id, "unit_id": unit_id, "route": route, "returned": returned}

    flow = load_flow(_default_flow_path())
    store = _FileStore()
    try:
        workflow = _run_workflow(case, flow, store)
    except Exception as exc:  # noqa: BLE001 - surfaced to the frontend
        raise HTTPException(500, f"Orchestrator failed: {type(exc).__name__}: {exc}") from exc
    evidence_bundle = _bundle(workflow, store)
    return {"workflow": workflow, "evidence": evidence_bundle.get("evidence", {}),
            "case": case, "raw_inputs": raw_inputs}


def main() -> None:
    import uvicorn
    print(f"Pod test UI on http://{HOST}:{PORT}  (local only, no authentication)")
    print(f".env: {len(ENV_LOADED)} variable(s) loaded" if ENV_LOADED else ".env: nothing loaded (no file, or all already set)")
    for note in ENV_ALIASES:
        print(f"env mapping applied: {note}")
    uvicorn.run(app, host=HOST, port=PORT)


if __name__ == "__main__":
    main()
