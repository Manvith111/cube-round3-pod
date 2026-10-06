"""Prep Manager rulebook — rules are data, not code (ported from the Round 2 agent).

The clauses and checks that the deterministic engine judges against. The engine
(`evaluate` in app.py) only ever READS from here, so "no invented rules" holds by
construction: to judge against a different marketplace, add a sibling catalogue and
point the engine at it — no engine change.

Source (Round 2): OpsConsole `src/lib/prepRequirements.ts` (FBA v1 rule pack).
Replace the quote/clause strings with the official challenge document verbatim.
"""
from __future__ import annotations

from typing import Callable

RULE_PACK = {"id": "fba", "version": "1", "name": "Amazon FBA Prep & Labeling",
             "source": "Marketplace Prep & Labeling Requirements (provided document)"}

# clause_key -> {clause, title, quote}
RULE_CLAUSES: dict[str, dict] = {
    "polybag": {"clause": "§2.1 Poly-bagging", "title": "Poly-bag required",
                "quote": "Units that are not already in sealed retail-ready packaging must be placed inside a "
                         "transparent poly bag so that the FNSKU label can be applied to the bag."},
    "seal": {"clause": "§2.2 Sealing", "title": "Poly-bag sealed",
             "quote": "Poly bags must be completely sealed. The product must not be able to fall out of the bag."},
    "suffocation": {"clause": "§2.3 Suffocation warning", "title": "Suffocation warning",
                    "quote": "Any poly bag with an opening of 5 inches (12.7 cm) or larger, measured when laid flat, "
                             "must carry a suffocation warning printed on the bag or on an attached label."},
    "fnsku": {"clause": "§3.1 FNSKU label", "title": "FNSKU label applied",
              "quote": "Each unit must have a single scannable FNSKU barcode label applied to the exterior of the "
                       "unit or its poly bag."},
    "placement": {"clause": "§3.2 Label placement", "title": "FNSKU on a flat, scannable surface",
                  "quote": "The FNSKU label must be placed on a flat surface. Do not place the barcode across a "
                           "curved surface, seam, corner or edge where it cannot be scanned reliably."},
    "match": {"clause": "§3.3 Correct FNSKU", "title": "FNSKU matches the product",
              "quote": "The FNSKU printed on the label must correspond to the product it is applied to. A unit "
                       "bearing the wrong FNSKU is mislabeled."},
    "cover": {"clause": "§3.4 Original barcodes", "title": "Original manufacturer barcode covered",
              "quote": "Any pre-existing scannable barcode on the exterior (for example the manufacturer UPC or EAN) "
                       "must be covered or rendered unscannable so that only the FNSKU is scanned."},
    "expiry": {"clause": "§4.1 Expiration dates", "title": "Expiry date visible",
               "quote": "For products that carry an expiration date, the date must be printed on each individual "
                        "unit and must remain visible after prep. A poly bag must not obscure the expiration date."},
    "handling": {"clause": "§4.2 Handling marks", "title": "Required handling marks present",
                 "quote": "Fragile units, and units requiring special handling, must display the required handling "
                          "marking (for example 'Fragile') on the exterior so it is visible during handling."},
    "thickness": {"clause": "§2.4 Bag material", "title": "Bag thickness / material",
                  "quote": "Poly bags must be made of durable material at least 1.5 mil thick."},
}


class CheckDef:
    """One citable check: which clause, whether a photo can verify it, and when it applies."""

    def __init__(self, check_id: str, name: str, clause_key: str, verifiable: bool,
                 applies_to: Callable[[dict], bool], expected: str):
        self.id = check_id
        self.name = name
        self.clause_key = clause_key
        self.verifiable = verifiable
        self.applies_to = applies_to
        self.expected = expected


# Ordered catalogue of every check the Prep Manager can run (mirrors Round 2 CHECK_CATALOG).
CHECK_CATALOG: list[CheckDef] = [
    CheckDef("polybag_present", "Poly-bag present", "polybag", True,
             lambda p: p["requires_polybag"], "The unit is enclosed in a transparent poly bag."),
    CheckDef("polybag_sealed", "Poly-bag sealed", "seal", True,
             lambda p: p["requires_polybag"], "The poly bag is fully sealed with no open side."),
    CheckDef("suffocation_warning_present", "Suffocation warning present", "suffocation", True,
             lambda p: p["requires_polybag"], "A suffocation warning is printed on the bag or an attached label."),
    CheckDef("suffocation_warning_legible", "Suffocation warning legible", "suffocation", True,
             lambda p: p["requires_polybag"], "The suffocation warning text is fully visible and readable."),
    CheckDef("fnsku_present", "FNSKU label present", "fnsku", True,
             lambda p: True, "A scannable FNSKU barcode label is applied to the unit."),
    CheckDef("fnsku_placement", "FNSKU placement", "placement", True,
             lambda p: True, "The FNSKU label lies flat — not across a curve, seam, corner or edge."),
    CheckDef("fnsku_text_match", "FNSKU text matches product", "match", True,
             lambda p: True, "The printed FNSKU equals the expected code for this product."),
    CheckDef("original_barcode_covered", "Original barcode covered", "cover", True,
             lambda p: p["cover_original_barcode"], "The manufacturer barcode is covered or unscannable."),
    CheckDef("expiry_visible", "Expiry date visible", "expiry", True,
             lambda p: p["has_expiry"], "The expiration date is printed on the unit and still visible."),
    CheckDef("handling_marks_present", "Handling marks present", "handling", True,
             lambda p: p["is_fragile"] or bool(p["required_handling_marks"]),
             "The required handling marking is displayed on the exterior."),
    CheckDef("bag_thickness_material", "Bag thickness / material", "thickness", False,
             lambda p: p["requires_polybag"], "Bag is a durable material at least 1.5 mil thick."),
]


def default_product(sku: str = "", expected_fnsku: str = "") -> dict:
    """A conservative product config when no catalogue entry is supplied: assume the
    strictest common FBA case (polybagged, barcode to cover) so required checks are run."""
    return {"sku": sku, "expected_fnsku": expected_fnsku, "name": sku or "unknown unit",
            "category": "unknown", "requires_polybag": True, "has_expiry": False,
            "is_fragile": False, "required_handling_marks": [], "cover_original_barcode": True}
