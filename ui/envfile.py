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
    """Map one Gemini model name onto the names the Pod's agents actually read. Names only are returned.

    * VLM_MODEL is the Gemini model name (Pack reads it directly). The same name is copied to PREP_MODEL (Prep) and
      MODEL_NAME (Recovery); both are read when the agent module is first imported, which happens after this runs.
    * Returns reads VLM_MODEL_GROQ (its own variable), so it does not clash with VLM_MODEL.
    * GROQ_API_KEY -> VLM_API_KEY (Returns) when VLM_API_KEY is not already set.
    Receiving hardcodes its model; no setting can change it (see ui/NOTES.md).
    """
    notes = []
    gemini = os.environ.get("VLM_MODEL", "").strip()
    if gemini:
        os.environ["PREP_MODEL"] = gemini
        os.environ["MODEL_NAME"] = gemini
        notes.append("VLM_MODEL (Gemini) -> PREP_MODEL, MODEL_NAME")
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
