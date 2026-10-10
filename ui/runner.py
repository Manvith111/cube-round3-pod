"""Run the REAL orchestrator for the UI and describe what it returned. Nothing here judges anything.

  * Full workflow:      orchestration.orchestrator.run_workflow(case, flow.json)
  * Single-stage test:  the same run_workflow, with an in-memory one-step copy of that stage's flow step.
                        It goes through the orchestrator's own client (in-process handle() or HTTP), validation,
                        evidence store and roll-up. It is NOT a full workflow and is labelled as such.
Each run gets its own FileStore under out/ui/runs/<run_id>/ (the orchestrator is idempotent per workflow_id, so a
shared store would silently re-use an earlier run). Every client is wrapped in a pass-through recorder that keeps a
copy of the exact Agent Input sent and the exact Agent Output (or exception) that came back. It changes nothing.
"""
from __future__ import annotations

import contextlib
import copy
import importlib
import json
import os
import re
import secrets
import shutil
import socket
import tempfile
import threading
import time
from pathlib import Path

from orchestration.clients import HttpClient, InProcClient, client_for, load_manifest
from orchestration.orchestrator import (applies, apply_override, bundle, default_flow_path, discover_inputs,
                                        flow_stages, load_flow, run_workflow)
from orchestration.store import FileStore
from shared.utils import sample_data
from shared.utils.records import utcnow
from shared.utils.schema import errors as schema_errors

from . import captures

ROOT = Path(__file__).resolve().parents[1]
LOCK = threading.Lock()  # one run at a time: runs may set INPUT_DIR for the "no image" test
TESTS = ("wrong_company", "no_image", "agent_down")
ALONE_NOTE = "Run alone, this stage gets no earlier evidence, so most results will be SILENT or UNCERTAIN."
SINGLE_LABEL = "SINGLE-STAGE TEST, NOT A FULL WORKFLOW"
REPLAY_BANNER = "REPLAY, not the agent judging this image"


def flow_path() -> Path:
    return Path(os.environ.get("ORCH_FLOW") or default_flow_path())


def out_root() -> Path:
    base = Path(os.environ.get("OUT_DIR") or "out")
    return (base if base.is_absolute() else ROOT / base) / "ui"


def runs_dir() -> Path:
    return out_root() / "runs"


def other_org(org: str) -> str:
    return next(o for o in captures.ORGS if o != org)


ROUTES = ("mfn", "fba", "unknown")


def build_case(org: str, unit: str, overrides: dict | None = None) -> dict:
    """The same case orchestration/api.py builds for POST /workflows (route and returned from the sample data).

    `overrides` (optional, used by the Next.js frontend for units that are not in the sample data) may set
    `route` and `returned`. Nothing else can be overridden."""
    case = {"org_id": org, "unit_id": unit, "route": sample_data.route(unit, org),
            "returned": sample_data.has("returns", unit, org)}
    overrides = overrides or {}
    if overrides.get("route") is not None:
        if overrides["route"] not in ROUTES:
            raise captures.CaptureError(f"route must be one of {list(ROUTES)}, not {overrides['route']!r}")
        case["route"] = overrides["route"]
    if overrides.get("returned") is not None:
        if not isinstance(overrides["returned"], bool):
            raise captures.CaptureError("returned must be true or false")
        case["returned"] = overrides["returned"]
    return case


# ---------------------------------------------------------------- custom case (expected values typed in the UI)
# A unit that is not in data/sample has no expected values: Receiving, Returns and Recovery look the unit up in the
# sample CSVs and refuse anything unknown. A "custom case" supplies those values for ONE run instead. Prep and Pack
# read them from the case context; for the others a couple of stand-in rows are shown to sample_data.row() for that
# unit and organisation only, while that run is in flight (runs are serialised by LOCK). Nothing is written to data/sample.
PHOTO_STAGES = ("receiving", "prep", "pack", "returns")
_SKU_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


def _text(c: dict, key: str, limit: int = 120) -> str:
    v = c.get(key)
    if v is None:
        return ""
    if not isinstance(v, str):
        raise captures.CaptureError(f"custom case: {key} must be text")
    v = v.strip()
    if len(v) > limit or any(ord(ch) < 32 for ch in v):
        raise captures.CaptureError(f"custom case: {key} is too long ({limit} characters at most) or has control characters")
    return v


def _whole(c: dict, key: str, default: int, lo: int, hi: int) -> int:
    v = c.get(key, default)
    if isinstance(v, bool) or not isinstance(v, int) or not lo <= v <= hi:
        raise captures.CaptureError(f"custom case: {key} must be a whole number from {lo} to {hi}")
    return v


def _yes_no(c: dict, key: str) -> bool:
    v = c.get(key, False)
    if not isinstance(v, bool):
        raise captures.CaptureError(f"custom case: {key} must be true or false")
    return v


def _items(c: dict, key: str, max_items: int, max_len: int) -> list[str]:
    v = c.get(key)
    if v is None or v == "":
        return []
    items = [s for s in re.split(r"[;,]", v)] if isinstance(v, str) else v
    if not isinstance(items, list) or not all(isinstance(s, str) for s in items):
        raise captures.CaptureError(f"custom case: {key} must be text separated by ; or ,")
    items = [s.strip() for s in items if s.strip()]
    if len(items) > max_items or any(len(s) > max_len for s in items):
        raise captures.CaptureError(f"custom case: {key} has too many items (max {max_items}) or an item over {max_len} characters")
    return items


def parse_custom(c: dict) -> dict:
    """Check what the user typed and return it cleaned. Raises CaptureError with a readable reason."""
    if not isinstance(c, dict):
        raise captures.CaptureError("custom case must be an object")
    sku = _text(c, "sku", 64)
    if not _SKU_RE.match(sku):
        raise captures.CaptureError("custom case: SKU is required (letters, digits, '.', '_' or '-', up to 64 characters)")
    lines = []
    for part in _items(c, "order_lines", 30, 80):
        s, _, q = part.partition(":")
        s = s.strip()
        if not _SKU_RE.match(s) or not q.strip().isdigit() or not 1 <= int(q) <= 10000:
            raise captures.CaptureError(f"custom case: order line {part!r} should look like SKU:quantity (for example MUG-1:2)")
        lines.append({"sku": s, "qty": int(q), "name": s})
    route = c.get("route", "mfn")
    if route not in ("mfn", "fba"):
        raise captures.CaptureError("custom case: route must be mfn or fba")
    return {"sku": sku, "name": _text(c, "name") or sku, "category": _text(c, "category", 60),
            "expected_fnsku": _text(c, "expected_fnsku", 40), "cartons": _whole(c, "cartons", 1, 1, 1000),
            "units": _whole(c, "units", 1, 1, 100000), "order_lines": lines,
            "parts_list": _items(c, "parts_list", 20, 60), "route": route, "returned": _yes_no(c, "returned"),
            "requires_polybag": _yes_no(c, "requires_polybag"), "has_expiry": _yes_no(c, "has_expiry"),
            "is_fragile": _yes_no(c, "is_fragile"), "cover_original_barcode": _yes_no(c, "cover_original_barcode"),
            "required_handling_marks": _items(c, "required_handling_marks", 10, 40)}


def build_custom(org: str, unit: str, mode: str, stage: str, custom: dict, test: str | None,
                 run_org: str | None = None) -> tuple[dict, dict, dict]:
    """-> (case, stand-in rows, cleaned custom values). Refuses a run that would be answered from stand-in values
    instead of photos: every stage that will run and looks at photos needs at least one."""
    if test == "no_image":
        raise captures.CaptureError("custom case: the 'No image' check is not available (it would run on stand-in values)")
    c = parse_custom(custom)
    case = {"org_id": run_org or org, "unit_id": unit, "route": c["route"], "returned": c["returned"], "sku": c["sku"],
            "name": c["name"], "expected_fnsku": c["expected_fnsku"], "requires_polybag": c["requires_polybag"],
            "has_expiry": c["has_expiry"], "is_fragile": c["is_fragile"],
            "cover_original_barcode": c["cover_original_barcode"],
            "required_handling_marks": c["required_handling_marks"], "order_lines": c["order_lines"],
            "order_id": unit, "channel": c["route"]}
    if c["category"]:
        case["category"] = c["category"]
    missing = []
    for step in load_flow(flow_path())["steps"]:
        st = step["stage"]
        if st not in PHOTO_STAGES or (mode == "single" and st != stage):
            continue
        if mode == "full" and not applies(step, case)[0]:
            continue
        if not discover_inputs(unit, st):
            missing.append(st)
    if missing:
        raise captures.CaptureError("custom case: add at least one photo for " + ", ".join(missing)
                                    + " first (a custom case is never answered from stand-in values)")
    now = utcnow()
    base = {"unit_id": unit, "org_id": org, "operator_id": "custom", "captured_at": now, "photo_refs": ""}
    rows = {
        "receiving": {**base, "record_id": f"CUSTOM-RCV-{unit}", "po_number": "CUSTOM", "po_line": "1",
                      "supplier": "Custom case (typed in the test UI)", "sku": c["sku"], "asin": "",
                      "product_title": c["name"], "spec_colour": "", "spec_variant": "", "spec_components": "",
                      "cartons_ordered": str(c["cartons"]), "cartons_received": str(c["cartons"]),
                      "units_per_carton_ordered": "", "units_per_carton_counted": "", "qty_ordered": str(c["units"]),
                      "qty_received": str(c["units"]), "identity_match": "", "carton_damage": "", "unit_damage": "",
                      "quality_flags": ""},
        "returns": {**base, "record_id": f"CUSTOM-RTN-{unit}", "order_id": unit, "ordered_sku": c["sku"],
                    "ordered_asin": "", "identity_match": "", "parts_list": ";".join(c["parts_list"]),
                    "parts_missing": "", "observed_state": "", "amazon_condition": "",
                    "operator_disposition": "pending_review"},
    }
    return case, rows, c


@contextlib.contextmanager
def _custom_rows(unit: str, org: str, rows: dict):
    """While a custom run is in flight, sample_data.row() also knows the stand-in rows for this unit and org (and only
    them; other units and the wrong-company check still see the real data). The original is always put back."""
    if not rows:
        yield
        return
    original = sample_data.row

    def patched(kind: str, unit_id: str, org_id: str) -> dict:
        if unit_id == unit and org_id == org and kind in rows:
            return dict(rows[kind])
        return original(kind, unit_id, org_id)

    sample_data.row = patched
    try:
        yield
    finally:
        sample_data.row = original


class PairFilter:
    """Returns only: the folder may hold several reference_N / returned_N photos, but the agent (and so the VLM)
    gets just pair N. Wraps the recorder, so the recorded Agent Input is exactly what the agent received."""

    def __init__(self, inner, pair: int):
        self.inner, self.pair = inner, pair

    def run(self, request: dict, timeout_s: float) -> dict:
        want = {f"reference_{self.pair}", f"returned_{self.pair}"}
        keep = [i for i in request.get("inputs") or [] if Path(str(i["ref"]).replace("\\", "/")).stem.lower() in want]
        return self.inner.run({**request, "inputs": keep}, timeout_s)


class RecordingClient:
    """Pass-through around the orchestrator's own client. Records; never alters requests or answers."""

    def __init__(self, stage: str, inner, log: list, description: str, emit=None):
        self.stage, self.inner, self.log, self.description = stage, inner, log, description
        self.emit = emit or (lambda event: None)

    def run(self, request: dict, timeout_s: float) -> dict:
        entry = {"stage": self.stage, "client": self.description, "at": utcnow(), "timeout_s": timeout_s,
                 "request": copy.deepcopy(request), "output": None, "exception": None}
        self.log.append(entry)
        self.emit({"type": "stage_start", "stage": self.stage, "inputs": len(request.get("inputs") or [])})
        try:
            out = self.inner.run(request, timeout_s)
        except Exception as exc:
            entry["exception"] = {"type": type(exc).__name__, "message": str(exc)}
            self.emit({"type": "stage_end", "stage": self.stage, "ok": False, "error": f"{type(exc).__name__}: {str(exc)[:200]}"})
            raise
        entry["output"] = copy.deepcopy(out)
        self.emit({"type": "stage_end", "stage": self.stage, "ok": True, "verdict": out.get("verdict"), "status": out.get("status")})
        return out


@contextlib.contextmanager
def _progress_hooks(stages: list[str], on_event):
    """Agents may expose a module-level `progress_hook` (see agents/receiving/app.py). While a run is in flight it is
    pointed at the run's event feed, then put back. Agents without a hook are left alone."""
    saved = []
    if on_event is not None:
        for st in stages:
            try:
                mod = importlib.import_module(load_manifest(st)["module"])
            except Exception:  # noqa: BLE001 - an agent that cannot even import is reported by the run itself
                continue
            if hasattr(mod, "progress_hook"):
                saved.append((mod, mod.progress_hook))
                mod.progress_hook = on_event
    try:
        yield
    finally:
        for mod, old in saved:
            mod.progress_hook = old


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _client(stage: str, dead: bool):
    if dead:  # the orchestrator's own HttpClient, pointed at a port where nothing listens
        c = HttpClient(load_manifest(stage))
        c.url = f"http://127.0.0.1:{_free_port()}"
        return c, f"HttpClient {c.url} (agent down test: nothing listens there)"
    c = client_for(stage)
    if isinstance(c, InProcClient):
        return c, f"InProcClient {load_manifest(stage)['module']}.handle (agent.json mode=inproc)"
    return c, f"HttpClient {c.url}"


@contextlib.contextmanager
def _input_dir(empty: bool):
    """For the no-image test only: point INPUT_DIR (the orchestrator's own setting) at an empty folder."""
    if not empty:
        yield captures.input_root()
        return
    out_root().mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="empty_input_", dir=out_root()))
    old = os.environ.get("INPUT_DIR")
    os.environ["INPUT_DIR"] = str(tmp)
    try:
        yield tmp
    finally:
        if old is None:
            os.environ.pop("INPUT_DIR", None)
        else:
            os.environ["INPUT_DIR"] = old
        shutil.rmtree(tmp, ignore_errors=True)


def returns_pairs(unit: str) -> list[int]:
    """Pair numbers N for which BOTH reference_N and returned_N exist in the unit's returns folder."""
    stems = {Path(f["name"]).stem.lower() for f in _listing(captures.input_root(), unit, "returns")}
    nums = lambda prefix: {int(s[len(prefix):]) for s in stems if s.startswith(prefix) and s[len(prefix):].isdigit()}  # noqa: E731
    return sorted(nums("reference_") & nums("returned_"))


def validate(mode: str, stage: str, org: str, unit: str, test: str | None, pair) -> tuple[str, str, str, str]:
    """Reject a bad request before anything runs. Returns the cleaned (mode, stage, org, unit)."""
    if mode not in ("single", "full"):
        raise captures.CaptureError("mode must be 'single' or 'full'")
    stage, org, unit = captures.check_stage(stage), captures.check_org(org), captures.check_unit(unit)
    if test not in (None, *TESTS):
        raise captures.CaptureError(f"unknown test {test!r}")
    if pair is not None:
        if not isinstance(pair, int) or isinstance(pair, bool) or pair not in returns_pairs(unit):
            raise captures.CaptureError(
                f"pair {pair!r} needs both reference_{pair} and returned_{pair} in the returns folder of {unit}; "
                f"complete pairs found: {returns_pairs(unit)}")
    return mode, stage, org, unit


def new_run_id() -> str:
    return f"{time.strftime('%Y%m%dT%H%M%S')}-{secrets.token_hex(3)}"


def execute(mode: str, stage: str, org: str, unit: str, test: str | None = None, pair: int | None = None,
            run_id: str | None = None, on_event=None, case_overrides: dict | None = None,
            custom: dict | None = None) -> dict:
    """Run the orchestrator. `on_event(dict)` (optional) is called as things happen: stage_start / stage_end from the
    recorder, plus whatever progress events an agent reports through its `progress_hook`."""
    mode, stage, org, unit = validate(mode, stage, org, unit, test, pair)
    run_org = other_org(org) if test == "wrong_company" else org
    rows, clean = {}, None
    if custom is not None:
        case, rows, clean = build_custom(org, unit, mode, stage, custom, test, run_org)
    else:
        case = build_case(run_org, unit, case_overrides)
    flow = load_flow(flow_path())
    if mode == "single":
        step = next((s for s in flow["steps"] if s["stage"] == stage), None)
        if step is None:
            raise captures.CaptureError(f"stage {stage!r} is not in flow {flow['flow_id']}")
        run_flow = {"flow_id": f"{flow['flow_id']}+ui-single-stage-{stage}",
                    "description": f"UI single-stage test of {stage}; built in memory from {flow_path().name}",
                    "steps": [{k: v for k, v in step.items() if k != "when"}], "defaults": flow.get("defaults", {})}
    else:
        run_flow = flow

    run_id = run_id or new_run_id()
    run_dir = runs_dir() / run_id
    log: list = []
    clients = {}
    for st in flow_stages(run_flow):
        inner, desc = _client(st, dead=(test == "agent_down" and st == stage))
        clients[st] = RecordingClient(st, inner, log, desc, emit=on_event)
        if st == "returns" and pair is not None:
            clients[st] = PairFilter(clients[st], pair)

    with LOCK, _input_dir(empty=(test == "no_image")) as used_root, _progress_hooks(flow_stages(run_flow), on_event), \
            _custom_rows(unit, org, rows):
        folders = {st: _listing(used_root, unit, st) for st in flow_stages(run_flow)}
        store = FileStore(run_dir)
        t0 = time.monotonic()
        wf = run_workflow(case, run_flow, store, clients)
        elapsed = int((time.monotonic() - t0) * 1000)
        b = bundle(wf, store)

    run = {"run_id": run_id, "created_at": utcnow(), "elapsed_ms": elapsed,
           "request": {"mode": mode, "stage": stage, "org_id": org, "unit_id": unit, "test": test, "pair": pair,
                       "custom": clean},
           "case": case, "flow_file": str(flow_path().relative_to(ROOT)) if flow_path().is_relative_to(ROOT) else str(flow_path()),
           "flow_used": run_flow, "input_root_used": str(used_root), "folders": folders,
           "workflow": b["workflow"], "evidence": b["evidence"], "calls": log}
    _save(run)
    return describe(run)


def _listing(root: Path, unit: str, stage: str) -> list[dict]:
    folder = root / unit / stage
    if not folder.is_dir():
        return []
    out = []
    for p in sorted(folder.iterdir()):
        if p.is_file() and not p.name.startswith("."):
            data = p.read_bytes()
            out.append({"name": p.name, "ref": p.relative_to(root).as_posix(), "size": len(data),
                        "sha256": captures.sha256(data)})
    return out


def _save(run: dict) -> None:
    d = runs_dir() / run["run_id"]
    d.mkdir(parents=True, exist_ok=True)
    (d / "ui-run.json").write_text(json.dumps(run, indent=2))


def load_run(run_id: str) -> dict:
    if not run_id or any(c not in "0123456789abcdefT-" for c in run_id):
        raise KeyError(run_id)
    p = runs_dir() / run_id / "ui-run.json"
    if not p.exists():
        raise KeyError(run_id)
    return json.loads(p.read_text())


def override(run_id: str, body: dict) -> dict:
    """Calls the orchestrator's own apply_override on this run's store. The UI adds nothing to it."""
    run = load_run(run_id)
    with LOCK:
        store = FileStore(runs_dir() / run_id)
        wf = apply_override(run["workflow"]["workflow_id"], store, record_id=body.get("record_id", ""),
                            new_verdict=body.get("new_verdict", ""), actor=body.get("actor", ""),
                            reason=body.get("reason", ""), new_outcome=body.get("new_outcome") or None)
        b = bundle(wf, store)
    run["workflow"], run["evidence"] = b["workflow"], b["evidence"]
    _save(run)
    return describe(run)


# ---------------------------------------------------------------- description for the screen
def _source(model: dict | None, manifest: dict) -> dict:
    model = model or {}
    name = str(model.get("name") or "")
    low = name.lower()
    if "replay" in low:
        kind, banner = "replay", REPLAY_BANNER
    elif low == "none":
        kind, banner = "none", ("NO MODEL RAN: the orchestrator wrote a stand-in record because this stage produced "
                                "no acceptable output. This is not a judgment.")
    elif low in ("rules", "human") or "stub" in low:
        kind, banner = low, f"Not a model: model.name = {name!r}"
    elif model.get("calls") == 0:
        # The record names a model but says it made no call: whatever answered, it was not that model.
        kind, banner = "no_call", (f"NO MODEL CALL: model.calls = 0, so this answer did not come from "
                                   f"{name!r}. It was produced without calling any model (for example a rules "
                                   f"engine or a replay of the sample CSV).")
    else:
        kind, banner = "model", None
    return {"name": name, "version": model.get("version"), "provider": model.get("provider"),
            "prompt_version": model.get("prompt_version"), "calls": model.get("calls"),
            "cost_usd": model.get("cost_usd"), "kind": kind, "banner": banner,
            "agent_json": {k: manifest.get(k) for k in ("agent_id", "mode", "implementation", "url")}}


def _norm(ref: str) -> str:
    return ref.replace("\\", "/")


def _stage_view(sr: dict, run: dict) -> dict:
    stage = sr["stage"]
    try:
        manifest = load_manifest(stage)
    except FileNotFoundError:
        manifest = {}
    calls = [c for c in run["calls"] if c["stage"] == stage]
    last = calls[-1] if calls else None
    raw_out = last["output"] if last else None
    sent = (last["request"].get("inputs") or []) if last else []
    sent_by_hash = {i.get("sha256"): i for i in sent if i.get("sha256")}
    rec = run["evidence"].get(sr["record_id"]) if sr.get("record_id") else None

    files = [{**f, "in_inputs_sent": f["sha256"] in sent_by_hash,
              "sent_ref": (sent_by_hash.get(f["sha256"]) or {}).get("ref")}
             for f in run["folders"].get(stage, [])]
    record_ids = set(run["workflow"]["evidence_references"])
    sent_refs = {_norm(i["ref"]) for i in sent}
    checks = (rec or {}).get("checks") or []
    refs = sorted({r for c in checks for r in (c.get("evidence_refs") or [])})
    ref_view = [{"ref": r, "cited_by": [c["check_key"] for c in checks if r in (c.get("evidence_refs") or [])],
                 "points_to": ("an image sent in this run" if _norm(r) in sent_refs else
                               "an earlier evidence record" if r in record_ids else
                               "nothing that was sent in this run")}
                for r in refs]
    return {
        "stage": stage, "state": sr["state"], "skipped_reason": sr.get("skipped_reason"),
        "record_id": sr.get("record_id"), "agent_id": sr.get("agent_id"), "verdict": sr.get("verdict"),
        "outcome": sr.get("outcome"), "evidence_status": sr.get("evidence_status"),
        "needs_human": sr.get("needs_human"), "attempts": sr.get("attempts"), "runs": sr.get("runs"),
        "duration_ms": sr.get("duration_ms"), "stage_error": sr.get("error"),
        "next_step_recommendation": sr.get("next_step_recommendation"),
        "decision": (rec or {}).get("decision"), "output_confidence": (raw_out or {}).get("confidence"),
        "checks": checks, "source": _source((rec or {}).get("model"), manifest) if rec else None,
        "client_calls": [{"client": c["client"], "at": c["at"], "timeout_s": c["timeout_s"],
                          "inputs_sent": c["request"].get("inputs") or [],
                          "previous_evidence_ids": [e["record_id"] for e in c["request"].get("previous_evidence", [])],
                          "returned_output": c["output"] is not None, "exception": c["exception"]} for c in calls],
        "folder_files": files, "inputs_sent": sent,
        "evidence_inputs": (rec or {}).get("inputs") or [], "evidence_refs": ref_view,
        "agent_output_schema_errors": schema_errors("agent-output", raw_out) if raw_out is not None else None,
        "evidence_schema_errors": schema_errors("evidence", rec) if rec else None,
        "raw": {"agent_input": last["request"] if last else None, "agent_output": raw_out, "evidence_record": rec},
    }


def _test_view(run: dict) -> dict | None:
    req, wf = run["request"], run["workflow"]
    codes = [e.get("code") for e in wf["errors"]]
    if req["test"] == "wrong_company":
        return {"name": "Wrong company test",
                "what_ran": f"{req['unit_id']} under {run['case']['org_id']} (the selected org was {req['org_id']})",
                "expected": "refused: agent_rejected (LookupError / HTTP 404) or tenant_mismatch, recorded as an error",
                "observed_error_codes": codes,
                "refusal_recorded": any(c in ("agent_rejected", "tenant_mismatch") for c in codes)}
    if req["test"] == "no_image":
        return {"name": "No image test",
                "what_ran": f"INPUT_DIR pointed at an empty folder ({run['input_root_used']}) for this run only",
                "expected": "the orchestrator sends inputs: [] and the system says what it does with that",
                "inputs_sent_per_stage": {c["stage"]: len(c["request"].get("inputs") or []) for c in run["calls"]},
                "observed_error_codes": codes}
    if req["test"] == "agent_down":
        return {"name": "Agent down test",
                "what_ran": f"the {req['stage']} agent was called through the orchestrator's HttpClient at a port "
                            f"where nothing listens; retries/timeout from the flow",
                "expected": "agent_unavailable or agent_timeout recorded, stage error, workflow FAILED, never success",
                "observed_error_codes": codes, "workflow_status": wf["status"]}
    return None


def describe(run: dict) -> dict:
    wf, req = run["workflow"], run["request"]
    notes = []
    if req.get("custom"):
        notes.append("Custom case: the expected values (product, counts, order lines, parts) were typed in the test UI, "
                     "not taken from the sample data, and there are no fee lines for Recovery to check.")
    if req["mode"] == "single":
        notes.append("One-stage test: only this agent ran, and status and outcome describe this stage alone. "
                     "Routing is skipped, so it runs even if a full workflow would skip it.")
        if req["stage"] in ("returns", "recovery"):
            notes.append(ALONE_NOTE)
    return {
        "run_id": run["run_id"], "created_at": run["created_at"], "elapsed_ms": run["elapsed_ms"],
        "request": req, "custom": bool(req.get("custom")),
        "label": SINGLE_LABEL if req["mode"] == "single" else "FULL WORKFLOW",
        "notes": notes, "case": run["case"], "flow_file": run["flow_file"], "flow_id": run["flow_used"]["flow_id"],
        "input_root_used": run["input_root_used"], "test": _test_view(run),
        "workflow": {k: wf.get(k) for k in ("workflow_id", "flow_id", "org_id", "subject_id", "status", "status_reason",
                                            "final_outcome", "halted", "errors", "overrides", "transitions",
                                            "evidence_references", "current_stage", "previous_stage")},
        "workflow_schema_errors": schema_errors("workflow-state", wf),
        "stages": [_stage_view(sr, run) for sr in wf["stage_results"]],
        "raw": {"workflow_state": wf},
    }
