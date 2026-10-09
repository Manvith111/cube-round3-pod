"""Shapes the backend's answers the way the Next.js pipeline page (ui/experiments/shyam-web) reads them.

Nothing here judges anything or calls an agent. It only re-arranges what the orchestrator already stored:
  * trace(run)  -> {run_id, case, workflow, evidence, raw_inputs}   (the workflow state and its evidence records, as is)
  * plan(...)   -> which stages will run and why the others are skipped (the orchestrator's own `applies`)
  * cases()     -> the sample units, for the unit picker
  * list_runs() -> recent full-workflow runs, for the history list
"""
from __future__ import annotations

import json
from pathlib import Path

from orchestration.orchestrator import applies
from shared.utils import sample_data

from . import runner

HISTORY_LIMIT = 50


def raw_inputs(unit: str, org: str) -> dict:
    """The sample-data row each agent would read for this unit (None where the unit has no row)."""
    out: dict = {}
    for kind in ("receiving", "prep", "pack", "returns"):
        try:
            out[kind] = dict(sample_data.row(kind, unit, org))
        except LookupError:
            out[kind] = None
    out["fees"] = [dict(r) for r in sample_data.fee_lines(unit, org)]
    return out


def trace(run: dict) -> dict:
    case = run["case"]
    return {"run_id": run["run_id"], "case": case, "workflow": run["workflow"], "evidence": run["evidence"],
            "raw_inputs": raw_inputs(case["unit_id"], case["org_id"])}


def plan(flow: dict, case: dict) -> list[dict]:
    """Per flow step: will it run for this case, and if not, the orchestrator's reason."""
    out = []
    for step in flow["steps"]:
        ok, why = applies(step, case)
        out.append({"stage": step["stage"], "will_run": ok, "reason": None if ok else why})
    return out


def cases() -> list[dict]:
    path = sample_data.data_dir() / "cases.json"
    items = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    out = []
    for c in items:
        unit, org, route = c["unit_id"], c["org_id"], c.get("route") or "unknown"
        returned = bool(c.get("returned"))
        out.append({"unit_id": unit, "org_id": org, "route": route, "returned": returned,
                    "has_pack": sample_data.has("pack", unit, org), "has_prep": sample_data.has("prep", unit, org),
                    "has_returns": sample_data.has("returns", unit, org),
                    "label": f"{unit} [{route.upper()}{' + RETURN' if returned else ''}] • {org}"})
    return out


def list_runs(limit: int = HISTORY_LIMIT) -> list[dict]:
    """Newest first. Only full-workflow runs; single-stage tests are not workflow history."""
    root = runner.runs_dir()
    if not root.is_dir():
        return []
    out = []
    for d in sorted((p for p in root.iterdir() if p.is_dir()), key=lambda p: p.name, reverse=True):
        f = d / "ui-run.json"
        if not f.is_file():
            continue
        try:
            run = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if run.get("request", {}).get("mode") != "full":
            continue
        wf, case = run["workflow"], run["case"]
        out.append({"run_id": run["run_id"], "workflow_id": wf.get("workflow_id"), "unit_id": case["unit_id"],
                    "org_id": case["org_id"], "route": case["route"], "returned": case["returned"],
                    "status": wf.get("status"), "final_outcome": wf.get("final_outcome"),
                    "timestamp": run.get("created_at"), "stage_count": len(run.get("evidence") or {}),
                    "data": trace(run)})
        if len(out) >= limit:
            break
    return out
