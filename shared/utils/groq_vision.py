"""One OpenAI-compatible chat call (Groq by default), shared by the Prep, Pack and Recovery agents.

Same settings and the same behaviour as the Receiving and Returns agents, so the whole pod talks to one provider:
  VLM_API_KEY         the key (sent in a request header, never in the URL, never in an error message)
  VLM_BASE_URL        default https://api.groq.com/openai/v1
  VLM_MODEL_GROQ      the vision model name (no default: a missing name is reported, not guessed)
  VLM_TIMEOUT_SECONDS per-call timeout, default 60
  VLM_MAX_IMAGES      images per request, default 3 (the limit of Groq's vision model); callers send photos in groups

The model only OBSERVES. Callers turn what it says into verdicts with fixed rules, so everything returned here is
treated as untrusted text and parsed defensively by the caller.
"""
from __future__ import annotations

import base64
import binascii
import copy
import hashlib
import json
import os
import re
import threading
import time
from collections import OrderedDict
from urllib.parse import urlparse

import httpx

from shared.utils.log import get_logger

log = get_logger("vision")

DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_MAX_IMAGES = 3
ATTEMPTS = 3               # per call; waits below apply to network errors, HTTP 5xx and short rate limits
BACKOFF_S = (3.0, 8.0)
MAX_QUOTA_WAIT_S = 45.0    # a 429 asking for a longer wait (a daily limit) fails at once instead of stalling the unit
_PLACEHOLDERS = ("your-key-here", "your_key_here")


class VisionError(RuntimeError):
    """A readable reason the call failed. Never contains the key."""


# ----------------------------------------------------------------------------------------------- settings
def api_key() -> str | None:
    v = (os.environ.get("VLM_API_KEY") or "").strip()
    return v if v and v not in _PLACEHOLDERS else None


def model_name() -> str | None:
    return (os.environ.get("VLM_MODEL_GROQ") or "").strip() or None


def base_url() -> str:
    return (os.environ.get("VLM_BASE_URL") or "").strip().rstrip("/") or DEFAULT_BASE_URL


def provider() -> str:
    return "openai-compatible:" + (urlparse(base_url()).hostname or "unknown")


def max_images() -> int:
    try:
        return max(1, int(os.environ.get("VLM_MAX_IMAGES", DEFAULT_MAX_IMAGES)))
    except ValueError:
        return DEFAULT_MAX_IMAGES


def _timeout() -> httpx.Timeout:
    try:
        seconds = float(os.environ.get("VLM_TIMEOUT_SECONDS", "60"))
    except ValueError:
        seconds = 60.0
    return httpx.Timeout(seconds, connect=10.0)


def chunks(items: list, size: int | None = None) -> list[list]:
    """Split photos into groups the provider accepts in one request."""
    n = size or max_images()
    return [items[i:i + n] for i in range(0, len(items), n)]


# ----------------------------------------------------------------------------------------------- cost savers
# Each is on by default and switched off with the flag set to 0 / false / off / no:
#   VLM_CACHE=1                 identical request (model + prompt + image bytes) -> the earlier answer, no API call
#   VLM_CACHE_TTL_SECONDS=600   how long an answer is reused
#   VLM_CACHE_MAX_ENTRIES=128   size limit (least recently used goes first)
#   VLM_VALIDATE_IMAGES=1       an empty / corrupt image is refused before the call (no API call, no charge)
#   VLM_LOG_USAGE=1             one log line per call: cache hit/miss and the token usage the API reported
# Only a successful, readable answer is ever cached; errors never are. Log fields avoid the word "token" because
# shared.utils.log masks any field with that word in its name.
def _flag(name: str) -> bool:
    return (os.environ.get(name) or "1").strip().lower() not in ("0", "false", "off", "no")


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


_CACHE: "OrderedDict[str, tuple[float, object]]" = OrderedDict()
_CACHE_LOCK = threading.Lock()


def cache_key(*parts) -> str:
    """SHA-256 over the parts (bytes or text), each length-prefixed so two requests can never collide by shifting text."""
    h = hashlib.sha256()
    for p in parts:
        b = p if isinstance(p, bytes) else str(p).encode("utf-8")
        h.update(len(b).to_bytes(8, "big"))
        h.update(b)
    return h.hexdigest()


def cache_get(key: str):
    if not _flag("VLM_CACHE"):
        return None
    ttl = _int_env("VLM_CACHE_TTL_SECONDS", 600)
    with _CACHE_LOCK:
        hit = _CACHE.get(key)
        if hit is None:
            return None
        if time.monotonic() - hit[0] > ttl:
            del _CACHE[key]
            return None
        _CACHE.move_to_end(key)
        return copy.deepcopy(hit[1])


def cache_put(key: str, value) -> None:
    if not _flag("VLM_CACHE"):
        return
    cap = max(1, _int_env("VLM_CACHE_MAX_ENTRIES", 128))
    with _CACHE_LOCK:
        _CACHE[key] = (time.monotonic(), copy.deepcopy(value))
        _CACHE.move_to_end(key)
        while len(_CACHE) > cap:
            _CACHE.popitem(last=False)


def cache_drop(key: str) -> None:
    with _CACHE_LOCK:
        _CACHE.pop(key, None)


def _looks_like_image(b: bytes) -> bool:
    return (b[:3] == b"\xff\xd8\xff" or b[:8] == b"\x89PNG\r\n\x1a\n" or b[:6] in (b"GIF87a", b"GIF89a")
            or (b[:4] == b"RIFF" and b[8:12] == b"WEBP") or (b[4:8] == b"ftyp" and b[8:12] in
                                                            (b"heic", b"heix", b"mif1", b"msf1", b"hevc", b"heim", b"heis")))


def check_image(data: bytes) -> None:
    """Refuse an empty or corrupt image before any API call. Raises VisionError (callers already handle it)."""
    if not _flag("VLM_VALIDATE_IMAGES"):
        return
    if not data:
        raise VisionError("the image is empty; no model call was made")
    if not _looks_like_image(data):
        raise VisionError("the image is corrupt or not a JPEG, PNG, WebP, GIF or HEIC file; no model call was made")


def check_data_url(url: str) -> None:
    """Same check for a `data:<mime>;base64,<payload>` URL."""
    if not _flag("VLM_VALIDATE_IMAGES"):
        return
    payload = url.split(",", 1)[1] if url.startswith("data:") and "," in url else ""
    try:
        check_image(base64.b64decode(payload, validate=True))
    except binascii.Error:
        raise VisionError("the image data is not valid base64; no model call was made") from None


def log_call(source: str, hit: bool, usage: dict | None = None, model: str | None = None) -> None:
    """One line per call. Never the key, the prompt or the image."""
    if not _flag("VLM_LOG_USAGE"):
        return
    u = usage or {}
    pin, pout = u.get("input_tokens"), u.get("output_tokens")
    log.info("vision_call", extra={"ctx": {
        "source": source, "cache": "hit" if hit else "miss", "model": model, "usage_in": pin, "usage_out": pout,
        "usage_total": (pin or 0) + (pout or 0) if (pin is not None or pout is not None) else None}})


def _request_key(system: str, user_text: str, images: list[dict] | None, max_tokens: int) -> str:
    parts = [model_name() or "", base_url(), max_tokens, system, user_text]
    for img in images or []:
        parts += [img["mime_type"], img.get("label") or "", img["data_b64"]]
    return cache_key(*parts)


# ----------------------------------------------------------------------------------------------- parsing
def strip_thinking(text: str) -> str:
    """Some reasoning models put their working inside <think>...</think> before the answer."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def extract_json(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end < start:
        raise ValueError("no JSON object in the model output")
    obj = json.loads(text[start:end + 1])
    if not isinstance(obj, dict):
        raise ValueError("the model output was not a JSON object")
    return obj


def _retry_after(resp: httpx.Response) -> float | None:
    try:
        return float(resp.headers.get("retry-after", ""))
    except ValueError:
        return None


# ----------------------------------------------------------------------------------------------- the call
def complete(system: str, user_text: str, images: list[dict] | None = None, *, max_tokens: int = 4096,
             on_retry=None) -> tuple[str, dict]:
    """One chat completion. `images` = [{"mime_type", "data_b64", "label" (optional text placed before the image)}].
    Returns (answer text with any <think> block removed, usage). Raises VisionError with a readable reason.
    `on_retry(reason, wait_s)` is called before each wait, if given."""
    key = api_key()
    if not key:
        raise VisionError("VLM_API_KEY is not set; no model call was made")
    model = model_name()
    if not model:
        raise VisionError("VLM_MODEL_GROQ (the vision model name) is not set; no model call was made")
    for img in images or []:
        check_data_url("data:;base64," + str(img.get("data_b64") or ""))
    ck = _request_key(system, user_text, images, max_tokens)
    if (cached := cache_get(ck)) is not None:
        log_call("shared", True, model=model)
        return cached, {"input_tokens": 0, "output_tokens": 0}  # nothing was spent on this one

    if images:
        content: list[dict] | str = []
        for img in images:
            if img.get("label"):
                content.append({"type": "text", "text": img["label"]})
            content.append({"type": "image_url",
                            "image_url": {"url": f"data:{img['mime_type']};base64,{img['data_b64']}"}})
        content.append({"type": "text", "text": user_text})
    else:
        content = user_text
    body = {"model": model, "temperature": 0, "max_completion_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}]}
    url = f"{base_url()}/chat/completions"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {key}"}

    def wait(reason: str, seconds: float) -> None:
        if on_retry is not None:
            try:
                on_retry(reason, seconds)
            except Exception:  # noqa: BLE001 - progress reporting must never change a result
                pass
        time.sleep(seconds)

    last = "unknown error"
    for attempt in range(1, ATTEMPTS + 1):
        try:
            resp = httpx.post(url, json=body, timeout=_timeout(), headers=headers)
        except httpx.HTTPError as exc:
            last = f"network: {type(exc).__name__}"
            if attempt < ATTEMPTS:
                wait(last, BACKOFF_S[attempt - 1])
                continue
            raise VisionError(f"{last} (after {ATTEMPTS} attempts)") from None
        try:
            payload = resp.json() if resp.content else {}
        except ValueError:
            payload = {}
        if resp.status_code >= 500 and attempt < ATTEMPTS:  # temporary, on the provider's side
            wait(f"HTTP {resp.status_code}: the model is busy", BACKOFF_S[attempt - 1])
            continue
        hold = _retry_after(resp) if resp.status_code == 429 else None
        if hold is not None and hold <= MAX_QUOTA_WAIT_S and attempt < ATTEMPTS:  # a per-minute limit: wait it out
            wait("HTTP 429: rate limit reached", hold + 1)
            continue
        if resp.status_code >= 400:
            err = payload.get("error") if isinstance(payload, dict) else None
            msg = (err.get("message") if isinstance(err, dict) else err) or f"HTTP {resp.status_code}"
            raise VisionError(f"HTTP {resp.status_code}: {str(msg)[:400]}")
        try:
            text = strip_thinking(str(payload["choices"][0]["message"]["content"] or ""))
        except (KeyError, IndexError, TypeError):
            raise VisionError("the response had no answer in it") from None
        if not text:
            raise VisionError("the model returned an empty answer")
        usage = payload.get("usage") or {}
        used = {"input_tokens": usage.get("prompt_tokens"), "output_tokens": usage.get("completion_tokens")}
        cache_put(ck, text)
        log_call("shared", False, used, model)
        return text, used
    raise VisionError(last)


def complete_json(system: str, user_text: str, images: list[dict] | None = None, *, max_tokens: int = 4096,
                  on_retry=None) -> tuple[dict, dict]:
    """Like `complete`, but the answer must contain one JSON object. Returns (object, usage)."""
    text, usage = complete(system, user_text, images, max_tokens=max_tokens, on_retry=on_retry)
    try:
        return extract_json(text), usage
    except ValueError as exc:
        cache_drop(_request_key(system, user_text, images, max_tokens))  # an unreadable answer is an error: never reuse it
        raise VisionError(f"unreadable model output: {exc}") from None
