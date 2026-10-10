"""Product catalog + auto-connect: map product details (SKU / title) to a unit in the pod.

The catalog is assembled from two sources and merged by SKU:

1. The synthetic sample CSVs (receiving/prep/pack/returns/fees) already carry a SKU,
   a product title and the owning unit/org for every demo unit. We derive a catalog
   entry per SKU from them so "search & connect" works out of the box.
2. An operator-uploaded catalog saved at ``data/catalog.json`` (CSV or JSON, parsed by
   the server). Uploaded rows win over derived rows for the same SKU, so a Pod can bring
   its own product list without touching the sample data.

``match`` scores a free-text or SKU query against every entry and returns the best unit,
so the frontend can auto-select it and run the pipeline. Everything is read-only against
the sample data; only ``data/catalog.json`` is written.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from shared.utils import sample_data

ROOT = Path(__file__).resolve().parents[1]


def catalog_path() -> Path:
    return sample_data.data_dir().parent / "catalog.json"


@dataclass
class CatalogEntry:
    sku: str
    title: str = ""
    unit_id: str = ""
    org_id: str = ""
    route: str = "unknown"
    returned: bool = False
    asin: str = ""
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "sku": self.sku, "title": self.title, "unit_id": self.unit_id,
            "org_id": self.org_id, "route": self.route, "returned": self.returned,
            "asin": self.asin, **({"extra": self.extra} if self.extra else {}),
        }


def _derived_entries() -> dict[str, CatalogEntry]:
    """One entry per SKU found in the sample CSVs, keyed by SKU (upper-cased)."""
    entries: dict[str, CatalogEntry] = {}

    def upsert(sku: str, unit_id: str, org_id: str, **fields) -> None:
        sku = (sku or "").strip()
        if not sku:
            return
        key = sku.upper()
        entry = entries.get(key) or CatalogEntry(sku=sku, unit_id=unit_id, org_id=org_id)
        entry.unit_id = entry.unit_id or unit_id
        entry.org_id = entry.org_id or org_id
        for name, value in fields.items():
            if value and not getattr(entry, name, None):
                setattr(entry, name, value)
        if entry.unit_id and entry.org_id:
            entry.route = sample_data.route(entry.unit_id, entry.org_id)
            entry.returned = sample_data.has("returns", entry.unit_id, entry.org_id)
        entries[key] = entry

    for r in sample_data.rows("receiving"):
        upsert(r.get("sku", ""), r.get("unit_id", ""), r.get("org_id", ""),
               title=r.get("product_title", ""), asin=r.get("asin", ""))
    for kind in ("prep", "pack", "returns"):
        for r in sample_data.rows(kind):
            upsert(r.get("sku") or r.get("ordered_sku", ""), r.get("unit_id", ""),
                   r.get("org_id", ""), asin=r.get("asin") or r.get("ordered_asin", ""))
    return entries


def _load_uploaded() -> list[dict]:
    path = catalog_path()
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return data if isinstance(data, list) else data.get("items", [])


def entries() -> list[dict]:
    """The merged catalog: derived-from-sample entries overlaid with uploaded rows (SKU wins)."""
    merged = _derived_entries()
    for raw in _load_uploaded():
        sku = str(raw.get("sku") or raw.get("SKU") or "").strip()
        if not sku:
            continue
        key = sku.upper()
        base = merged.get(key) or CatalogEntry(sku=sku)
        base.sku = sku
        base.title = str(raw.get("title") or raw.get("product_title") or base.title or "")
        base.unit_id = str(raw.get("unit_id") or base.unit_id or "")
        base.org_id = str(raw.get("org_id") or base.org_id or "")
        base.asin = str(raw.get("asin") or base.asin or "")
        if raw.get("route"):
            base.route = str(raw["route"])
        if isinstance(raw.get("returned"), bool):
            base.returned = raw["returned"]
        known = {"sku", "SKU", "title", "product_title", "unit_id", "org_id", "asin", "route", "returned"}
        leftover = {k: v for k, v in raw.items() if k not in known}
        if leftover:
            base.extra = {**base.extra, **leftover}
        merged[key] = base
    return [e.to_dict() for e in merged.values()]


def save_uploaded(items: list[dict]) -> int:
    """Persist an uploaded catalog (already parsed into row dicts). Returns the row count."""
    clean = [dict(r) for r in items if isinstance(r, dict) and (r.get("sku") or r.get("SKU"))]
    path = catalog_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(clean, indent=2), encoding="utf-8")
    return len(clean)


def _score(query: str, entry: dict) -> float:
    """Simple, explainable relevance: exact SKU beats prefix beats token overlap in title."""
    q = query.strip().lower()
    if not q:
        return 0.0
    sku = str(entry.get("sku", "")).lower()
    title = str(entry.get("title", "")).lower()
    asin = str(entry.get("asin", "")).lower()
    if q == sku or q == asin:
        return 1.0
    if sku and (q in sku or sku in q):
        return 0.85
    q_tokens = {t for t in q.replace("-", " ").split() if t}
    if not q_tokens:
        return 0.0
    hay = f"{sku} {title} {asin}".replace("-", " ")
    hay_tokens = {t for t in hay.split() if t}
    overlap = q_tokens & hay_tokens
    if not overlap:
        return 0.0
    return 0.3 + 0.5 * (len(overlap) / len(q_tokens))


def match(query: str, limit: int = 5) -> dict:
    """Rank catalog entries against a SKU / product-detail query.

    Returns ``{"query", "best", "matches"}`` where ``best`` is the top entry that resolves
    to a concrete unit (or None), and ``matches`` is the ranked shortlist with scores.
    """
    ranked = []
    for entry in entries():
        score = _score(query, entry)
        if score > 0:
            ranked.append({**entry, "score": round(score, 3)})
    ranked.sort(key=lambda e: e["score"], reverse=True)
    best = next((e for e in ranked if e.get("unit_id") and e.get("org_id")), None)
    return {"query": query, "best": best, "matches": ranked[:limit]}
