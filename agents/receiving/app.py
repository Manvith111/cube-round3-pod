"""Receiving Manager: agent entry point.

Three paths, chosen by what the request carries:

  1. Photos AND a vision-model key -> the REAL path. ONE model call PER PHOTO (the Pod lead asked for image-by-image
     output instead of one batched call). The model only OBSERVES what is visible in that one photo; fixed rules
     below turn each observation into PASS / FAIL / UNCERTAIN; the six checks are then combined across photos.
     Every photo's own result is kept in `payload.per_image`.
  2. Photos, but no key, or every photo failed -> a "pending" record (fail open) with the real error text.
  3. No photos at all (the sample units the contract tests use) -> a CSV REPLAY, labelled model.name "csv-replay",
     calls 0. It is not this agent's judgment.

The model is any OpenAI-compatible vision endpoint, by default Groq, using the same settings as the Returns agent.
Environment (names only, see .env.example):  VLM_API_KEY  VLM_BASE_URL  VLM_MODEL_GROQ  INPUT_DIR
(`VLM_MODEL` is NOT used here: the Pack agent reads that name for its Gemini model.) The key is sent in a request
header, never in the URL, so it cannot appear in an error message.

Tenancy: the unit must exist under subject.org_id in the sample data, else LookupError (HTTP 404).
Only files under data/input/<subject_id>/receiving/ are ever read.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import time
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import urlparse

import httpx

from shared.utils import sample_data
from shared.utils.records import build_output, build_record, check, pending_output, rollup
from shared.utils.server import make_app
from shared.utils.stubs import photos, verdict_from

STAGE = "receiving"
AGENT_ID = "receiving-agent@2"
PROMPT_VERSION = "rcv-obs-v1"
DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"   # used when VLM_BASE_URL is not set (same default as Returns)
ROOT = Path(__file__).resolve().parents[2]
MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic"}
CHECKS = ["identity_match", "carton_count", "quantity", "carton_damage", "unit_damage", "quality_flags"]
CONF_MIN = 0.70            # an observation below this confidence is never turned into PASS or FAIL
MAX_IMAGES = 12            # safety cap on model calls per unit
MAX_IMAGE_BYTES = 3 * 1024 * 1024   # Groq limits a base64 image to 4 MB; base64 adds about a third
TIMEOUT = httpx.Timeout(60.0, connect=10.0)
ATTEMPTS = 3               # per photo; waits between attempts below (only for network errors and HTTP 5xx)
BACKOFF_S = (3.0, 8.0)
MAX_QUOTA_WAIT_S = 45.0    # a 429 asking for a longer wait (a daily limit) fails at once instead of stalling the unit
REPLAY_MODEL = {"name": "csv-replay", "version": "0", "provider": None, "calls": 0, "cost_usd": 0}
# damage and quality: one photo showing a problem is enough to FAIL. Identity and counts: contradicting photos -> UNCERTAIN.
ANY_FAIL_WINS = {"carton_damage", "unit_damage", "quality_flags"}

# Optional progress reporting. A host (the Pod test UI) may set `progress_hook` to a function that receives small dicts
# describing what is happening right now. Nothing depends on it: with no hook the agent behaves exactly the same,
# and an error inside the hook is swallowed so progress reporting can never change a result.
progress_hook = None
_current: dict[str, Any] = {}   # the photo being processed, so retry notices can name it


def _emit(event: dict) -> None:
    hook = progress_hook
    if hook is None:
        return
    try:
        hook({"stage": STAGE, **event})
    except Exception:  # noqa: BLE001
        pass


def _note_retry(reason: str, wait_s: float) -> None:
    _emit({"type": "photo_retry", "index": _current.get("index"), "file": _current.get("file"),
           "reason": reason, "wait_s": round(wait_s, 1)})


# ----------------------------------------------------------------------------------------------- inputs
def _input_root() -> Path:
    return Path(os.environ.get("INPUT_DIR", ROOT / "data" / "input"))


def _image_inputs(request: dict) -> list[dict]:
    return [i for i in request.get("inputs") or []
            if i.get("kind") == "image" or PurePosixPath(str(i.get("ref", "")).replace("\\", "/")).suffix.lower() in MIME]


def _resolve(ref: str, subject_id: str) -> Path | None:
    """The file for an input ref, only if it sits under data/input/<subject_id>/receiving/. Never any other path."""
    parts = PurePosixPath(ref.replace("\\", "/")).parts
    if len(parts) < 3 or parts[0] != subject_id or parts[1] != STAGE or ".." in parts:
        return None
    root = _input_root().resolve()
    path = (root / Path(*parts)).resolve()
    return path if path.is_relative_to(root) and path.is_file() else None


def _api_key() -> str | None:
    for name in ("VLM_API_KEY",):
        v = (os.environ.get(name) or "").strip()
        if v and v not in ("your-key-here", "your_key_here"):
            return v
    return None


# ----------------------------------------------------------------------------------------------- replay
def _replay(request: dict, r: dict) -> dict:
    """No photos: replay the sample CSV row, labelled. Not a judgment by this agent."""
    qo, qr = int(r["qty_ordered"]), int(r["qty_received"])
    co, cr = int(r["cartons_ordered"]), int(r["cartons_received"])
    refs = [p["ref"] for p in photos(r)]
    flags = [f for f in r["quality_flags"].split(";") if f]
    bad = {"crushing", "water", "tears"}
    checks = [
        check("identity_match", verdict_from(r["identity_match"], {"yes"}, {"no"}), None,
              expected=f"{r['sku']} ({r['product_title']})", observed=r["identity_match"], evidence_refs=refs,
              uncertain_reason="poor_image"),
        check("carton_count", "PASS" if co == cr else "FAIL", None, expected=co, observed=cr, evidence_refs=refs),
        check("quantity", "PASS" if qo == qr else "FAIL", None, expected=qo, observed=qr, evidence_refs=refs),
        check("carton_damage", verdict_from(r["carton_damage"], {"none"}, bad), None, expected="none",
              observed=r["carton_damage"], evidence_refs=refs, uncertain_reason="poor_image"),
        check("unit_damage", verdict_from(r["unit_damage"], {"none"}, bad), None, expected="none",
              observed=r["unit_damage"], evidence_refs=refs, uncertain_reason="poor_image"),
        check("quality_flags", "FAIL" if flags else "PASS", None, expected=[], observed=flags, evidence_refs=refs),
    ]
    verdict = rollup(checks)
    outcome = {"PASS": "accept", "FAIL": "accept_with_exceptions", "UNCERTAIN": "pending_review"}[verdict]
    record = build_record(
        request, agent_id=AGENT_ID, record_id=r["record_id"], captured_at=r["captured_at"], operator_id=r["operator_id"],
        unit_scope="po_line", refs={"po_number": r["po_number"], "po_line": r["po_line"], "sku": r["sku"], "asin": r["asin"]},
        checks=checks, outcome=outcome, model=REPLAY_MODEL, inputs=photos(r),
        reason="csv-replay of the Round 2 sample row: no photos were supplied, so no model looked at anything. "
               "This is not a judgment by the Receiving agent.",
        payload={"replay": True, "supplier": r["supplier"], "qty_ordered": qo, "qty_received": qr,
                 "shortfall_units": max(qo - qr, 0), "quality_flags": flags})
    return build_output(record)


# ----------------------------------------------------------------------------------------------- the model, one photo at a time
SYSTEM = "\n".join([
    "You are the OBSERVATION component of an automated warehouse receiving system.",
    "You are shown ONE photograph. Report strictly and literally what is visible in it.",
    "You do NOT decide pass or fail; fixed rules do that from your observations.",
    "Rules:",
    "1. Describe only what you can actually see. Never assume or guess.",
    '2. If something is not shown, is blurry, glary, cropped, too dark or you are unsure, use "cant_tell" '
    "(or null for a count) and a low confidence.",
    "3. confidence is a number from 0 to 1 for that single field. Use above 0.7 only when it is clearly visible.",
    "4. Count cartons or units only if you can actually count them. Set all_in_frame to true only if every carton "
    "(or unit) of the shipment is visible in this photo.",
    "5. Output ONLY a single JSON object, no prose and no markdown fences.",
])


def _user_prompt(r: dict) -> str:
    return "\n".join([
        f"Expected product: {r['sku']} ({r['product_title']}).",
        f"Expected cartons: {r['cartons_ordered']}. Expected units: {r['qty_ordered']}.",
        "Return exactly this JSON shape:",
        json.dumps({
            "photo_usable": True, "usable_issues": ["blurry"], "photo_shows": "carton | pallet | unit | label | document | other",
            "product_match": {"value": "match | no_match | cant_tell", "confidence": 0.0, "evidence": "what you see"},
            "cartons_visible": {"count": None, "all_in_frame": False, "confidence": 0.0},
            "units_visible": {"count": None, "all_in_frame": False, "confidence": 0.0},
            "carton_damage": {"value": "none | damaged | cant_tell", "confidence": 0.0, "evidence": "what you see"},
            "unit_damage": {"value": "none | damaged | cant_tell", "confidence": 0.0, "evidence": "what you see"},
            "quality_issues": {"items": [], "confidence": 0.0},
        }, indent=1),
    ])


def _extract_json(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end < start:
        raise ValueError("no JSON object in the model output")
    return json.loads(text[start:end + 1])


def _retry_after(resp: httpx.Response) -> float | None:
    """Seconds the provider asks us to wait (the standard Retry-After header), or None if not given."""
    try:
        return float(resp.headers.get("retry-after", ""))
    except ValueError:
        return None


def _strip_thinking(text: str) -> str:
    """Some reasoning models put their working inside <think>...</think> before the answer."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def _call_model(model: str, key: str, row: dict, data: bytes, mime: str) -> tuple[dict, dict]:
    """One vision call for one photo through an OpenAI-compatible endpoint (Groq by default).
    Returns (observation, usage). Raises RuntimeError("HTTP 4xx: message"), never containing the key."""
    base = (os.environ.get("VLM_BASE_URL") or "").strip().rstrip("/") or DEFAULT_BASE_URL
    body = {"model": model, "temperature": 0, "max_completion_tokens": 4096,
            "messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": [
                             {"type": "text", "text": _user_prompt(row)},
                             {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64.b64encode(data).decode()}"}}]}]}
    last = "unknown error"
    for attempt in range(1, ATTEMPTS + 1):
        try:
            resp = httpx.post(f"{base}/chat/completions", json=body, timeout=TIMEOUT,
                              headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
        except httpx.HTTPError as exc:
            last = f"network: {type(exc).__name__}"
            if attempt < ATTEMPTS:
                _note_retry(last, BACKOFF_S[attempt - 1])
                time.sleep(BACKOFF_S[attempt - 1])
                continue
            raise RuntimeError(f"{last} (after {ATTEMPTS} attempts)") from None
        try:
            payload = resp.json() if resp.content else {}
        except ValueError:
            payload = {}
        if resp.status_code >= 500 and attempt < ATTEMPTS:  # temporary on the provider's side
            _note_retry(f"HTTP {resp.status_code}: the model is busy", BACKOFF_S[attempt - 1])
            time.sleep(BACKOFF_S[attempt - 1])
            continue
        wait = _retry_after(resp) if resp.status_code == 429 else None
        if wait is not None and wait <= MAX_QUOTA_WAIT_S and attempt < ATTEMPTS:  # a per-minute limit: wait it out
            _note_retry("HTTP 429: rate limit reached", wait + 1)
            time.sleep(wait + 1)
            continue
        if resp.status_code >= 400:
            err = payload.get("error")
            msg = (err.get("message") if isinstance(err, dict) else err) or f"HTTP {resp.status_code}"
            raise RuntimeError(f"HTTP {resp.status_code}: {str(msg)[:400]}")
        try:
            text = _strip_thinking(str(payload["choices"][0]["message"]["content"] or ""))
        except (KeyError, IndexError, TypeError):
            raise RuntimeError("the response had no answer in it") from None
        if not text:
            raise RuntimeError("the model returned an empty answer")
        try:
            obs = _extract_json(text)
        except ValueError as exc:
            raise RuntimeError(f"unreadable model output: {exc}") from None
        usage = payload.get("usage") or {}
        return obs, {"prompt_tokens": usage.get("prompt_tokens"), "output_tokens": usage.get("completion_tokens")}
    raise RuntimeError(last)


# ----------------------------------------------------------------------------------------------- rules: observation -> verdict
def _num(v: Any) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return 0.0
    return min(max(x, 0.0), 1.0)


def _field(obs: dict, name: str) -> dict:
    v = obs.get(name)
    return v if isinstance(v, dict) else {}


def _judge(obs: dict, row: dict) -> dict[str, dict]:
    """The six per-photo verdicts. Pure rules; a low-confidence or unclear observation is always UNCERTAIN."""
    usable = obs.get("photo_usable") is not False
    why_unc = "insufficient_evidence" if usable else "poor_image"
    co, qo = int(row["cartons_ordered"]), int(row["qty_ordered"])
    out: dict[str, dict] = {}

    def put(key: str, verdict: str, conf: float | None, observed: Any, detail: str) -> None:
        out[key] = {"check_key": key, "verdict": verdict, "confidence": conf, "observed": observed, "detail": detail,
                    "uncertain_reason": why_unc if verdict == "UNCERTAIN" else None}

    pm = _field(obs, "product_match")
    c = _num(pm.get("confidence"))
    v = "PASS" if (pm.get("value") == "match" and c >= CONF_MIN and usable) else \
        "FAIL" if (pm.get("value") == "no_match" and c >= CONF_MIN and usable) else "UNCERTAIN"
    put("identity_match", v, c if v != "UNCERTAIN" else None, pm.get("value"), str(pm.get("evidence") or ""))

    for key, field, expected in (("carton_count", "cartons_visible", co), ("quantity", "units_visible", qo)):
        f = _field(obs, field)
        c, count = _num(f.get("confidence")), f.get("count")
        if isinstance(count, float) and count.is_integer():
            count = int(count)
        if not usable or not isinstance(count, int) or isinstance(count, bool) or f.get("all_in_frame") is not True or c < CONF_MIN:
            put(key, "UNCERTAIN", None, count, "count not reliable from this photo")
        else:
            put(key, "PASS" if count == expected else "FAIL", c, count, f"counted {count}, expected {expected}")

    for key, field in (("carton_damage", "carton_damage"), ("unit_damage", "unit_damage")):
        f = _field(obs, field)
        c = _num(f.get("confidence"))
        v = "PASS" if (f.get("value") == "none" and c >= CONF_MIN and usable) else \
            "FAIL" if (f.get("value") == "damaged" and c >= CONF_MIN and usable) else "UNCERTAIN"
        put(key, v, c if v != "UNCERTAIN" else None, f.get("value"), str(f.get("evidence") or ""))

    q = _field(obs, "quality_issues")
    items = q.get("items") if isinstance(q.get("items"), list) else None
    c = _num(q.get("confidence"))
    if items is None or c < CONF_MIN or not usable:
        put("quality_flags", "UNCERTAIN", None, items, "quality not reliable from this photo")
    else:
        put("quality_flags", "FAIL" if items else "PASS", c, items, "; ".join(map(str, items)))
    return out


def _combine(key: str, per_image: list[dict], row: dict) -> dict:
    """Combine one check across the photos that were analysed."""
    rows = [(p["ref"], p["checks"][key]) for p in per_image if p["status"] == "analysed"]
    fails = [(r, c) for r, c in rows if c["verdict"] == "FAIL"]
    passes = [(r, c) for r, c in rows if c["verdict"] == "PASS"]
    expected = {"identity_match": f"{row['sku']} ({row['product_title']})", "carton_count": int(row["cartons_ordered"]),
                "quantity": int(row["qty_ordered"]), "carton_damage": "none", "unit_damage": "none", "quality_flags": []}[key]
    if key in ANY_FAIL_WINS:
        verdict, deciding, reason = ("FAIL", fails, None) if fails else ("PASS", passes, None) if passes else ("UNCERTAIN", [], "insufficient_evidence")
    elif fails and passes:
        verdict, deciding, reason = "UNCERTAIN", fails + passes, "conflicting_evidence"
    else:
        verdict, deciding, reason = ("FAIL", fails, None) if fails else ("PASS", passes, None) if passes else ("UNCERTAIN", [], "insufficient_evidence")
    if verdict == "UNCERTAIN" and not rows:
        reason = "model_error"
    refs = [r for r, _ in deciding] or [p["ref"] for p in per_image]
    observed = {PurePosixPath(r.replace("\\", "/")).name: c["observed"] for r, c in deciding} or None
    conf = min((c["confidence"] for _, c in deciding if c["confidence"] is not None), default=None) if verdict != "UNCERTAIN" else None
    detail = "; ".join(f"{PurePosixPath(r.replace(chr(92), '/')).name}: {c['detail']}" for r, c in deciding if c["detail"])[:400]
    return check(key, verdict, conf, expected=expected, observed=observed, detail=detail, evidence_refs=refs, uncertain_reason=reason)


# ----------------------------------------------------------------------------------------------- real path
def _real(request: dict, row: dict, imgs: list[dict]) -> dict:
    s = request["subject"]
    key = _api_key()
    if not key:
        return pending_output(request, code="model_error", agent_id=AGENT_ID,
                              message="photos were received but VLM_API_KEY is not set; no model call was made")
    model = (os.environ.get("VLM_MODEL_GROQ") or "").strip()
    if not model:
        return pending_output(request, code="model_error", agent_id=AGENT_ID,
                              message="photos were received but VLM_MODEL_GROQ (the vision model name) is not set; no model call was made")
    base_url = (os.environ.get("VLM_BASE_URL") or "").strip() or DEFAULT_BASE_URL
    provider = "openai-compatible:" + (urlparse(base_url).hostname or "unknown")
    t0 = time.monotonic()
    per_image: list[dict] = []
    todo = imgs[:MAX_IMAGES]
    _emit({"type": "photos_total", "total": len(todo), "checks": CHECKS, "model": model,
           "files": [PurePosixPath(str(i["ref"]).replace("\\", "/")).name for i in todo]})
    for idx, item in enumerate(todo):
        ref = str(item["ref"])
        fname = PurePosixPath(ref.replace("\\", "/")).name
        _current.update({"index": idx, "file": fname})
        _emit({"type": "photo_start", "index": idx, "file": fname})
        entry: dict[str, Any] = {"ref": ref, "sha256": item.get("sha256"), "status": "error", "latency_ms": None,
                                 "tokens": None, "photo_shows": None, "photo_usable": None, "issues": None,
                                 "observation": None, "checks": None, "error": None}
        path = _resolve(ref, s["subject_id"])
        if path is None:
            entry["error"] = {"code": "upstream_missing", "message": f"{ref!r} is not a readable file under data/input/{s['subject_id']}/{STAGE}/"}
        elif path.stat().st_size > MAX_IMAGE_BYTES:
            entry["error"] = {"code": "upstream_missing", "message": f"{ref!r} is over {MAX_IMAGE_BYTES} bytes"}
        else:
            t1 = time.monotonic()
            try:
                obs, usage = _call_model(model, key, row, path.read_bytes(), MIME.get(path.suffix.lower(), "image/jpeg"))
            except RuntimeError as exc:
                entry["error"] = {"code": "model_error", "message": str(exc)}
            else:
                entry.update({"status": "analysed", "observation": obs, "tokens": usage,
                              "photo_shows": obs.get("photo_shows"), "photo_usable": obs.get("photo_usable"),
                              "issues": obs.get("usable_issues"), "checks": _judge(obs, row)})
            entry["latency_ms"] = int((time.monotonic() - t1) * 1000)
        per_image.append(entry)
        _emit({"type": "photo_done", "index": idx, "file": fname, "status": entry["status"], "ms": entry["latency_ms"],
               "verdicts": {k: v["verdict"] for k, v in entry["checks"].items()} if entry["checks"] else None,
               "error": entry["error"]["message"][:300] if entry["error"] else None})
    _current.clear()

    ok = [p for p in per_image if p["status"] == "analysed"]
    if not ok:
        first = next(p["error"] for p in per_image if p["error"])
        return pending_output(request, code=first["code"],
                              message=f"no photo could be analysed ({len(per_image)} tried). First error: {first['message']}"[:600],
                              agent_id=AGENT_ID)

    checks = [_combine(k, per_image, row) for k in CHECKS]
    verdict = rollup(checks)
    outcome = {"PASS": "accept", "FAIL": "accept_with_exceptions", "UNCERTAIN": "pending_review"}[verdict]
    qo, qr = int(row["qty_ordered"]), int(row["qty_received"])
    flags = [f for f in row["quality_flags"].split(";") if f]
    confs = [c["confidence"] for c in checks if c["confidence"] is not None]
    sample = ("supplier, qty_ordered, qty_received, shortfall_units and quality_flags are copied from the sample CSV row; "
              "they were not observed in the photos")
    record = build_record(
        request, agent_id=AGENT_ID,
        record_id=f"RCV-{s['subject_id']}-{hashlib.sha256(request['request_id'].encode()).hexdigest()[:8]}",
        captured_at=row["captured_at"], operator_id=None, unit_scope="po_line",
        refs={"po_number": row["po_number"], "po_line": row["po_line"], "sku": row["sku"], "asin": row["asin"]},
        checks=checks, outcome=outcome, verdict=verdict, confidence=min(confs) if confs else None,
        latency_ms=int((time.monotonic() - t0) * 1000),
        model={"name": model, "version": "unpinned", "provider": provider, "prompt_version": PROMPT_VERSION,
               "calls": len(ok), "cost_usd": None},
        inputs=[{"ref": p["ref"], "sha256": p["sha256"], "kind": "image"} for p in per_image],
        reason=f"{len(ok)} of {len(per_image)} photos analysed one by one by {model}; "
               f"{sum(c['verdict'] == 'FAIL' for c in checks)} check(s) failed, "
               f"{sum(c['verdict'] == 'UNCERTAIN' for c in checks)} uncertain",
        payload={"supplier": row["supplier"], "qty_ordered": qo, "qty_received": qr, "shortfall_units": max(qo - qr, 0),
                 "quality_flags": flags, "sample_csv_note": sample,
                 "analysis": {"mode": "one model call per photo", "model": model, "prompt_version": PROMPT_VERSION,
                              "photos_total": len(per_image), "photos_analysed": len(ok),
                              "photos_failed": len(per_image) - len(ok), "cost_note": "cost_usd is null: the price was not computed"},
                 "per_image": per_image})
    return build_output(record)


# ----------------------------------------------------------------------------------------------- entry point
def handle(request: dict) -> dict:
    s = request["subject"]
    row = sample_data.row("receiving", s["subject_id"], s["org_id"])  # LookupError -> 404 (tenancy)
    imgs = _image_inputs(request)
    return _real(request, row, imgs) if imgs else _replay(request, row)


app = make_app(STAGE, handle, version="2.0.0")
