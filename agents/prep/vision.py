"""AI observation step (ported from Round 2 OpsConsole `src/lib/vision.ts`).

Gemini is used ONLY to describe what is visible in the photos. It never emits a verdict:
it returns met / not_met / cant_tell per check, a confidence, which photo + where, the
visible evidence, a usability rating per photo, and a literal transcription of the FNSKU
label. The deterministic rules engine (app.py `evaluate`) turns these observations into
verdicts. One batched call per unit (engineering rule 2). Fails open: any error returns an
`available: False` result, which the engine renders as UNCERTAIN, never a guess.
"""
from __future__ import annotations

import json
import os

import httpx

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_MODEL = os.environ.get("PREP_MODEL", "gemini-2.5-flash")
PROMPT_VERSION = "prep-obs-v1"
ENV_KEYS = ("GEMINI_API_KEY", "GOOGLE_API_KEY")


def api_key() -> str | None:
    for k in ENV_KEYS:
        v = os.environ.get(k)
        if v and v.strip():
            return v.strip()
    return None


def _observable(product: dict, catalog) -> list:
    """Checks the AI should observe: verifiable, applicable, and not the derived text-match."""
    return [c for c in catalog if c.verifiable and c.id != "fnsku_text_match" and c.applies_to(product)]


def build_prompt(product: dict, catalog, clauses: dict) -> tuple[str, str]:
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
        '4. Cite which photo (photo_index, starting at 1) and where in it (location). If the area is not shown in '
        'any photo, use "cant_tell" with photo_index null.',
        '5. The "evidence" field must describe the specific visible thing you based the status on. If you cannot '
        'point to something visible, use "cant_tell" with empty evidence.',
        "6. For the label, transcribe the FNSKU/barcode text EXACTLY as printed. If unreadable, set legible=false "
        "and value null. Never invent or auto-correct characters.",
        "7. Rate each photo usable=false if it is blurry, glary, cropped, too dark, out of frame, or too "
        "low-resolution to judge; list the issues.",
        "8. Output ONLY a single JSON object. No prose, no markdown fences.",
    ])
    user_text = "\n".join([
        f'Product: {product["name"]} (SKU {product["sku"]}, category {product["category"]}).',
        f'Expected FNSKU label text: {product["expected_fnsku"]}.',
        "Photos follow in order; photo_index starts at 1.",
        "",
        "Observe these checks (use these exact check_id values):",
        checklist,
        "",
        "Also: read the FNSKU label text, and rate every photo's usability.",
        '{"photo_quality": [{"photo_index": 1, "usable": true, "issues": []}], '
        '"label_text_read": {"value": "X001ABC123", "photo_index": 1, "legible": true, "confidence": "high"}, '
        '"observations": [{"check_id": "polybag_present", "status": "met", "confidence": "high", '
        '"photo_index": 1, "location": "whole frame", "evidence": "clear poly bag, all edges visible"}]}',
    ])
    return system, user_text


def extract_json(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in model output")
    return json.loads(text[start:end + 1])


def unavailable(product: dict, catalog, model: str, note: str) -> dict:
    """An honest empty observation: every observable check becomes cant_tell."""
    return {"available": False, "model": model, "note": note, "calls": 0,
            "photo_quality": [], "label_read": {"value": None, "photo_index": None, "legible": False,
                                                "confidence": "low"},
            "observations": [{"check_id": c.id, "status": "cant_tell", "confidence": "low",
                              "photo_index": None, "location": "", "evidence": ""}
                             for c in _observable(product, catalog)]}


def observe(product: dict, photos: list[dict], catalog, clauses: dict, timeout_s: float = 60.0) -> dict:
    """One batched Gemini call. `photos` = [{media_type, data_base64}]. Fails open on any error."""
    if not photos:
        return unavailable(product, catalog, "none", "No photos were provided.")
    key = api_key()
    if not key:
        return unavailable(product, catalog, "none",
                           "AI vision unavailable: no provider configured (set GEMINI_API_KEY).")

    system, user_text = build_prompt(product, catalog, clauses)
    parts = [{"inline_data": {"mime_type": p.get("media_type", "image/jpeg"), "data": p["data_base64"]}}
             for p in photos]
    parts.append({"text": user_text})
    body = {"systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"temperature": 0, "maxOutputTokens": 8192,
                                 "responseMimeType": "application/json"}}
    try:
        resp = httpx.post(f"{GEMINI_BASE}/{DEFAULT_MODEL}:generateContent",
                          headers={"Content-Type": "application/json", "X-goog-api-key": key},
                          json=body, timeout=timeout_s)
        data = resp.json() if resp.content else {}
        if resp.status_code >= 400:
            msg = (data.get("error") or {}).get("message") or f"HTTP {resp.status_code}"
            return unavailable(product, catalog, "none", f"AI observation failed: {msg}")
        text = "\n".join(p.get("text", "") for p in
                         (((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])).strip()
        if not text:
            return unavailable(product, catalog, "none", "Gemini returned an empty response.")
        parsed = extract_json(text)
    except Exception as exc:  # network, timeout, bad JSON — all fail open
        return unavailable(product, catalog, "none", f"AI observation failed: {type(exc).__name__}: {exc}")

    known = {c.id for c in catalog}
    return {
        "available": True, "model": f"gemini:{DEFAULT_MODEL}", "note": None, "calls": 1,
        "photo_quality": [{"photo_index": q.get("photo_index"), "usable": bool(q.get("usable")),
                           "issues": q.get("issues", [])} for q in parsed.get("photo_quality", [])],
        "label_read": {"value": (parsed.get("label_text_read") or {}).get("value"),
                       "photo_index": (parsed.get("label_text_read") or {}).get("photo_index"),
                       "legible": bool((parsed.get("label_text_read") or {}).get("legible")),
                       "confidence": (parsed.get("label_text_read") or {}).get("confidence", "low")},
        "observations": [o for o in parsed.get("observations", []) if o.get("check_id") in known],
    }
