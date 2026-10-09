"""Load the repo-root .env into os.environ for the UI server process (server side only).

Why this exists: nothing else in the repo reads .env (no python-dotenv), and the agents run in-process inside the UI
server, so keys must be in this process's environment. Rules:
  * a variable that is already set in the real environment wins (a .env value never overrides it);
  * values are never printed, logged, returned by any endpoint or written anywhere; only the NAMES are counted;
  * .env is git-ignored (.gitignore line 1-2). Keep only placeholders in .env.example.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_LINE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$")


def _value(raw: str) -> str:
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "\"'":
        return raw[1:-1]
    return re.split(r"\s+#", raw, maxsplit=1)[0].strip()  # "KEY=abc  # note" -> "abc"


def apply_model_aliases() -> list[str]:
    """Small name mappings so one .env works for every agent. Names only are returned.

    All five agents now use one provider (Groq, or any OpenAI-compatible endpoint) with the same three settings:
    VLM_API_KEY, VLM_BASE_URL, VLM_MODEL_GROQ. Gemini is no longer used, so the old mapping of the Gemini model name
    (VLM_MODEL) onto PREP_MODEL / MODEL_NAME is gone: nothing reads those names any more.
    * GROQ_API_KEY -> VLM_API_KEY when VLM_API_KEY is not already set.
    """
    notes = []
    if not os.environ.get("VLM_API_KEY", "").strip() and os.environ.get("GROQ_API_KEY", "").strip():
        os.environ["VLM_API_KEY"] = os.environ["GROQ_API_KEY"].strip()
        notes.append("GROQ_API_KEY -> VLM_API_KEY")
    return notes


def load(path: Path | None = None) -> list[str]:
    """Names of the variables set from the file. Missing file: nothing happens."""
    p = path or ROOT / ".env"
    if not p.is_file():
        return []
    set_now = []
    for line in p.read_text(encoding="utf-8-sig").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = _LINE.match(line)
        if not m:
            continue
        name, raw = m.group(1), _value(m.group(2))
        if raw and name not in os.environ:
            os.environ[name] = raw
            set_now.append(name)
    return set_now
