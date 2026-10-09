"""Put captures where the orchestrator already looks for them: <INPUT_DIR>/<subject_id>/<stage>/.

The root is the same one `orchestration.orchestrator.discover_inputs` reads (env INPUT_DIR, default data/input),
so the UI never invents a second location. Source files given by path are only READ: never moved, renamed or edited.
Nothing is ever overwritten: a new file gets the next free name, and identical bytes already saved under the same
role are reported as "already present" instead of being saved twice.
"""
from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGES = ("receiving", "prep", "pack", "returns", "recovery")
ORGS = ("org_demo_alpha", "org_demo_bravo")
IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".heic")  # the extensions the orchestrator labels kind="image"
MAX_BYTES = 25 * 1024 * 1024
UNIT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")

# role -> file name prefix. Only Returns has a naming rule (given by the Pod lead for this UI).
# No agent app.py / README defines names for the other stages, so numbered names are a placeholder (ui/NOTES.md).
ROLES: dict[str, dict[str, str]] = {
    "receiving": {"capture": ""},
    "prep": {"capture": ""},
    "pack": {"capture": ""},
    "returns": {"reference": "reference_", "returned": "returned_"},
    "recovery": {"capture": ""},
}
ROLE_LABELS = {"capture": "Captures", "reference": "Reference photos (catalogue)",
               "returned": "Returned photos (the item that came back)"}
RULES = {
    "receiving": "Saved as 1.<ext>, 2.<ext>, ... No agent defines a naming rule yet (open question in ui/NOTES.md).",
    "prep": "Saved as 1.<ext>, 2.<ext>, ... No agent defines a naming rule yet (open question in ui/NOTES.md).",
    "pack": "Saved as 1.<ext>, 2.<ext>, ... No agent defines a naming rule yet (open question in ui/NOTES.md).",
    "returns": "reference_1.<ext>, reference_2.<ext>, ... = catalogue photos; "
               "returned_1.<ext>, returned_2.<ext>, ... = photos of the item that came back.",
    "recovery": "Recovery has no camera: it reads fee lines and earlier evidence. Any file saved here is still passed "
                "to it as inputs[] by the orchestrator. Saved as 1.<ext>, 2.<ext>, ...",
}
GITIGNORE_BODY = ("# Written by ui/ (Pod test UI): captures uploaded or copied for local tests stay out of git.\n"
                  "# This file ignores itself too. Delete it if the Pod decides to commit demo captures here.\n*\n")


class CaptureError(ValueError):
    pass


def input_root() -> Path:
    return Path(os.environ.get("INPUT_DIR", ROOT / "data" / "input"))


def check_unit(unit: str) -> str:
    unit = (unit or "").strip()
    if not UNIT_RE.match(unit):
        raise CaptureError(f"unit id {unit!r} is not allowed: use letters, digits, '.', '_' or '-' (max 64)")
    return unit


def check_stage(stage: str) -> str:
    if stage not in STAGES:
        raise CaptureError(f"unknown stage {stage!r}; expected one of {list(STAGES)}")
    return stage


def check_org(org: str) -> str:
    if org not in ORGS:
        raise CaptureError(f"unknown org {org!r}; expected one of {list(ORGS)}")
    return org


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sniff(data: bytes) -> str | None:
    """Is this really an image? Checks the file signature, not just the extension."""
    if data[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[4:8] == b"ftyp" and data[8:12] in (b"heic", b"heix", b"mif1", b"msf1", b"hevc", b"heim", b"heis"):
        return "heic"
    return None


def stage_dir(unit: str, stage: str) -> Path:
    return input_root() / check_unit(unit) / check_stage(stage)


def ref_of(path: Path) -> str:
    return path.relative_to(input_root()).as_posix()


def _guard_unit(unit_dir: Path) -> None:
    """A path-specific ignore rule inside the unit folder the UI writes to (no shared ignore file is edited)."""
    unit_dir.mkdir(parents=True, exist_ok=True)
    gi = unit_dir / ".gitignore"
    if not gi.exists():
        gi.write_text(GITIGNORE_BODY)


def list_stage(unit: str, stage: str) -> list[dict]:
    """The UI's own, independent listing of a stage folder (used to cross-check what the orchestrator sent)."""
    folder = stage_dir(unit, stage)
    if not folder.is_dir():
        return []
    out = []
    for p in sorted(folder.iterdir()):
        if p.is_file() and not p.name.startswith("."):
            data = p.read_bytes()
            out.append({"name": p.name, "ref": ref_of(p), "path": str(p), "size": len(data), "sha256": sha256(data)})
    return out


def save(unit: str, stage: str, role: str, filename: str, data: bytes, source: str) -> dict:
    unit, stage = check_unit(unit), check_stage(stage)
    if role not in ROLES[stage]:
        raise CaptureError(f"role {role!r} is not used by {stage}; expected one of {list(ROLES[stage])}")
    ext = Path(filename).suffix.lower()
    if ext not in IMAGE_EXTS:
        raise CaptureError(f"{filename}: extension {ext or '(none)'} is not one of {list(IMAGE_EXTS)}")
    if not data:
        raise CaptureError(f"{filename}: the file is empty")
    if len(data) > MAX_BYTES:
        raise CaptureError(f"{filename}: {len(data)} bytes is over the {MAX_BYTES} byte limit")
    if not sniff(data):
        raise CaptureError(f"{filename}: the bytes are not a JPEG, PNG, WebP or HEIC image")

    folder = stage_dir(unit, stage)
    _guard_unit(folder.parent)
    folder.mkdir(parents=True, exist_ok=True)
    digest, prefix = sha256(data), ROLES[stage][role]
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)\.[^.]+$")
    numbers = []
    for p in sorted(folder.iterdir()):
        m = pattern.match(p.name) if p.is_file() else None
        if not m:
            continue
        numbers.append(int(m.group(1)))
        if sha256(p.read_bytes()) == digest:
            return {"source": source, "role": role, "status": "already_present", "name": p.name, "ref": ref_of(p),
                    "path": str(p), "sha256": digest, "size": len(data)}
    name = f"{prefix}{max(numbers, default=0) + 1}{ext}"
    dest, tmp = folder / name, folder / f".{name}.tmp"  # dot-prefixed: discover_inputs skips it
    tmp.write_bytes(data)
    os.replace(tmp, dest)
    written = sha256(dest.read_bytes())
    if written != digest:
        raise CaptureError(f"{name}: written bytes do not match (sha256 {written} != {digest})")
    return {"source": source, "role": role, "status": "saved", "name": name, "ref": ref_of(dest), "path": str(dest),
            "sha256": digest, "size": len(data)}


def copy_from_path(unit: str, stage: str, role: str, raw_path: str) -> dict:
    """Copy one local file. Relative paths are resolved against the repo root. The original is only read."""
    text = (raw_path or "").strip().strip('"').strip("'")
    if not text:
        raise CaptureError("empty path")
    p = Path(text).expanduser()
    if not p.is_absolute():
        p = ROOT / p
    try:
        p = p.resolve(strict=True)
    except (FileNotFoundError, OSError) as exc:
        raise CaptureError(f"{text}: file not found ({type(exc).__name__})") from exc
    if not p.is_file():
        raise CaptureError(f"{text}: not a file")
    before = p.stat()
    data = p.read_bytes()
    result = save(unit, stage, role, p.name, data, source=str(p))
    after = p.stat()
    result["source_sha256"] = sha256(data)
    result["original_unchanged"] = (before.st_size, before.st_mtime_ns) == (after.st_size, after.st_mtime_ns) \
        and sha256(p.read_bytes()) == result["source_sha256"]
    return result


def resolve_ref(ref: str) -> Path:
    """A capture file under the input root, for thumbnails. Refuses anything outside it or not an image."""
    root = input_root().resolve()
    p = (root / ref).resolve()
    if root not in p.parents or p.suffix.lower() not in IMAGE_EXTS or not p.is_file():
        raise CaptureError("not a capture image under the input root")
    return p
