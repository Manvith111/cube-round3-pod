"""AI observation step (ported from Round 2 OpsConsole `src/lib/vision.ts`).

A vision model is used ONLY to describe what is visible in the photos. It never emits a verdict:
it returns met / not_met / cant_tell per check, a confidence, which photo + where, the
visible evidence, a usability rating per photo, and a literal transcription of the FNSKU
label. The deterministic rules engine (app.py `evaluate`) turns these observations into
verdicts. Fails open: any error returns an `available: False` result, which the engine renders
as UNCERTAIN, never a guess.

Provider: any OpenAI-compatible vision endpoint, Groq by default, through shared.utils.groq_vision (the same
VLM_API_KEY / VLM_BASE_URL / VLM_MODEL_GROQ settings as Receiving and Returns). One call per group of up to
VLM_MAX_IMAGES photos (3 on Groq's vision model); a unit with more photos than that is sent in several groups
and the observations are merged (see `_merge`). Gemini is no longer used.
"""
from __future__ import annotations

import json

from shared.utils import groq_vision
from shared.utils.groq_vision import VisionError

PROMPT_VERSION = "prep-obs-v1"
_STATUS = ("met", "not_met", "cant_tell")
_CONF = ("high", "medium", "low")
_CONF_RANK = {"low": 0, "medium": 1, "high": 2}


def _observable(product: dict, catalog) -> list:
    """Checks the AI should observe: verifiable, applicable, and not the derived text-match."""
    return [c for c in catalog if c.verifiable and c.id != "fnsku_text_match" and c.applies_to(product)]


def build_prompt(product: dict, catalog, clauses: dict, shown: tuple[int, int, int] | None = None) -> tuple[str, str]:
    """`shown` = (first, last, total) photo numbers when the photos are sent in several groups."""
    checks = _observable(product, catalog)
    checklist = "\n".join(f'  - "{c.id}" — {c.name}. Rule: {clauses[c.clause_key]["quote"]}' for c in checks)
    system = "\n".join([
        "You are the OBSERVATION component of an automated warehouse prep-inspection system.",
        "Your ONLY job is to report, strictly and literally, what is visible in the photographs.",
        "You do NOT decide pass or fail — a separate deterministic rules engine does that from your observations.",
        "",
        "Hard rules:",
        "1. Describe only what you can actually see. Never assume, infer, or guess what is likely.",
        '2. For each check choose status: "met" (you can clearly SEE the requirement satisfied), "not_met" (you '
        'can clearly SEE it violated or absent), or "cant_tell" (the area is not shown, is blurry/glary/cropped/'
        'dark, or you are unsure). When in any doubt, use "cant_tell".',
        '3. Use confidence "high" only when the relevant area is clearly visible and in focus; use "low" if '
        "anything is ambiguous.",
        '4. Cite which photo (photo_index, as given in its label) and where in it (location). If the area is not '
        'shown in any photo, use "cant_tell" with photo_index null.',
        '5. The "evidence" field must describe the specific visible thing you based the status on. If you cannot '
        'point to something visible, use "cant_tell" with empty evidence.',
        "6. For the label, transcribe the FNSKU/barcode text EXACTLY as printed. If unreadable, set legible=false "
        "and value null. Never invent or auto-correct characters.",
        "7. Rate each photo usable=false if it is blurry, glary, cropped, too dark, out of frame, or too "
        "low-resolution to judge; list the issues.",
        "8. Output ONLY a single JSON object. No prose, no markdown fences.",
    ])
    lines = [
        f'Product: {product["name"]} (SKU {product["sku"]}, category {product["category"]}).',
        f'Expected FNSKU label text: {product["expected_fnsku"]}.',
        "Each photo is preceded by a label giving its photo_index (starting at 1). Use that number.",
    ]
    if shown and shown[2] > (shown[1] - shown[0] + 1):
        lines.append(f"You are shown photos {shown[0]} to {shown[1]} of {shown[2]}. Other photos are checked "
                     "separately, so a check whose area is not shown in THESE photos must be cant_tell.")
    lines += [
        "",
        "Observe these checks (use these exact check_id values):",
        checklist,
        "",
        "Also: read the FNSKU label text, and rate every photo's usability.",
        '{"photo_quality": [{"photo_index": 1, "usable": true, "issues": []}], '
        '"label_text_read": {"value": "X001ABC123", "photo_index": 1, "legible": true, "confidence": "high"}, '
        '"observations": [{"check_id": "polybag_present", "status": "met", "confidence": "high", '
        '"photo_index": 1, "location": "whole frame", "evidence": "clear poly bag, all edges visible"}]}',
    ]
    return system, "\n".join(lines)


def extract_json(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in model output")
    return json.loads(text[start:end + 1])


def unavailable(product: dict, catalog, model: str, note: str) -> dict:
    """An honest empty observation: every observable check becomes cant_tell."""
    return {"available": False, "model": model, "provider": None, "note": note, "calls": 0,
            "photo_quality": [], "label_read": {"value": None, "photo_index": None, "legible": False,
                                                "confidence": "low"},
            "observations": [{"check_id": c.id, "status": "cant_tell", "confidence": "low",
                              "photo_index": None, "location": "", "evidence": ""}
                             for c in _observable(product, catalog)]}


# ----------------------------------------------------------------- reading what the model said
# A model told to answer in JSON is not held to a schema, so every value is checked before the rules see it.
# Anything unexpected becomes the cautious value (cant_tell / low / not usable), never a PASS or a FAIL.
def _int(v):
    try:
        return int(v) if not isinstance(v, bool) and v is not None else None
    except (TypeError, ValueError):
        return None


def _true(v) -> bool:
    return v is True or (isinstance(v, str) and v.strip().lower() == "true")


def _conf(v) -> str:
    s = str(v).strip().lower() if v is not None else ""
    return s if s in _CONF else "low"


def _norm_observation(o) -> dict | None:
    if not isinstance(o, dict) or not isinstance(o.get("check_id"), str):
        return None
    status = str(o.get("status")).strip().lower()
    return {"check_id": o["check_id"].strip(), "status": status if status in _STATUS else "cant_tell",
            "confidence": _conf(o.get("confidence")), "photo_index": _int(o.get("photo_index")),
            "location": str(o.get("location") or ""), "evidence": str(o.get("evidence") or "")}


def _norm_quality(q) -> dict | None:
    if not isinstance(q, dict) or _int(q.get("photo_index")) is None:
        return None
    issues = q.get("issues")
    return {"photo_index": _int(q["photo_index"]), "usable": _true(q.get("usable")),
            "issues": [str(i) for i in issues] if isinstance(issues, list) else []}


def _norm_label(lr) -> dict:
    lr = lr if isinstance(lr, dict) else {}
    value = lr.get("value")
    return {"value": str(value) if value not in (None, "") else None, "photo_index": _int(lr.get("photo_index")),
            "legible": _true(lr.get("legible")), "confidence": _conf(lr.get("confidence"))}


def _merge(parsed: list[dict], known: set[str]) -> dict:
    """Combine the observations from several groups of photos into one.
    Per check the most trustworthy observation wins: a decisive one (met / not_met) over cant_tell, then higher
    confidence, and on a tie not_met (the cautious reading). The label is the most confident legible read."""
    quality, best, labels = [], {}, []
    for p in parsed:
        quality += [q for q in map(_norm_quality, p.get("photo_quality") or []) if q]
        labels.append(_norm_label(p.get("label_text_read")))
        for o in map(_norm_observation, p.get("observations") or []):
            if not o or o["check_id"] not in known:
                continue
            rank = (o["status"] != "cant_tell", _CONF_RANK[o["confidence"]], o["status"] == "not_met")
            if o["check_id"] not in best or rank > best[o["check_id"]][0]:
                best[o["check_id"]] = (rank, o)
    label = max(labels, key=lambda l: (l["legible"] and bool(l["value"]), _CONF_RANK[l["confidence"]]))
    return {"photo_quality": quality, "label_read": label, "observations": [o for _, o in best.values()]}


def observe(product: dict, photos: list[dict], catalog, clauses: dict) -> dict:
    """Observe the photos. `photos` = [{ref, media_type, data_base64}]. Fails open on any error."""
    if not photos:
        return unavailable(product, catalog, "none", "No photos were provided.")
    if not groq_vision.api_key():
        return unavailable(product, catalog, "none",
                           "AI vision unavailable: no provider configured (set VLM_API_KEY).")
    model = groq_vision.model_name()
    if not model:
        return unavailable(product, catalog, "none",
                           "AI vision unavailable: VLM_MODEL_GROQ (the vision model name) is not set.")

    parsed, calls, number = [], 0, 0
    for group in groq_vision.chunks(photos):
        first, last = number + 1, number + len(group)
        system, user_text = build_prompt(product, catalog, clauses, (first, last, len(photos)))
        images = []
        for p in group:
            number += 1
            images.append({"mime_type": p.get("media_type", "image/jpeg"), "data_b64": p["data_base64"],
                           "label": f"--- PHOTO {number} ---"})
        try:
            obj, _usage = groq_vision.complete_json(system, user_text, images, max_tokens=4096)
        except VisionError as exc:
            return unavailable(product, catalog, "none", f"AI observation failed: {exc}")
        calls += 1
        parsed.append(obj)

    merged = _merge(parsed, {c.id for c in catalog})
    return {"available": True, "model": model, "provider": groq_vision.provider(), "note": None, "calls": calls,
            **merged}
