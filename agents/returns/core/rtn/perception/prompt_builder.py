"""Builds the single batched multimodal prompt sent to the VLM.

Per the architecture: one general-purpose VLM, one batched call per unit.
The prompt bundles order info, reference/catalogue images, the expected
components list, the retrieved (not memorized) Amazon condition-scale
definitions, and the return photos — then instructs the model to report
observations only.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

from agents.returns.core.rtn.schemas.input import UnitInput
from agents.returns.core.rtn.schemas.vlm_output import VLMResponse

_CONDITION_SCALE_PATH = (
    Path(__file__).resolve().parent.parent / "reference_data" / "amazon_condition_scale.json"
)


def load_condition_scale_doc() -> dict:
    """Loads the retrieved Amazon condition-scale reference document.

    This is read from disk at call time (not hardcoded in the prompt
    string, not relying on the model's training data) so the system can
    cite exactly what version/source was used for every evidence record.
    """
    with open(_CONDITION_SCALE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


SYSTEM_INSTRUCTIONS = """\
You are a visual inspection reporter for e-commerce returns. You will be \
given: order information, reference/catalogue images of the item as it was \
sold, a list of expected components, the retrieved official Amazon \
condition-scale reference definitions, and one or more photos of the \
actually returned item.

Your ONLY job is to report what is visually observable. You must NOT:
- decide or output an Amazon condition category (New / Used-Like New / \
Used-Very Good / Used-Good / Used-Acceptable) — you are given that scale \
only as context to describe observations in comparable terms, never to \
select a label from it.
- decide or output a disposition (restock/refurbish/liquidate/dispose).
- infer or assume anything not visible in the provided images. If a photo \
does not show something clearly, say so.
- collapse "clearly absent" and "can't tell" into the same answer. If the \
expected location for a part is visible in a photo and the part is not \
there, that is MISSING. If you cannot see enough of the item to tell \
(bad angle, occlusion, cropping, blur, not photographed at all), that is \
NOT_OBSERVED. These must never be confused.
- report high confidence when the underlying photo is blurry, poorly lit, \
low resolution, or the relevant area is occluded/cropped. In that case set \
evidence_quality to PARTIAL, POOR, or INSUFFICIENT regardless of how \
confident you feel about your best guess, and lower confidence accordingly \
when evidence_quality is POOR or INSUFFICIENT.
- guess an identity match when the reference and returned images show \
plausibly-similar but not clearly-identical products. Prefer UNCERTAIN \
over a forced MATCH or NO_MATCH when evidence is genuinely ambiguous.

For every conclusion you must cite the specific visual evidence that \
supports it (what you saw, in which image). Return ONLY the structured \
JSON object requested — no prose outside the JSON.
"""


def build_user_content(unit: UnitInput) -> list[dict]:
    """Builds the multimodal 'user' message content array: text blocks
    interleaved with image blocks, in one message, for one batched call.
    """
    condition_scale = load_condition_scale_doc()

    order_block = {
        "order_info": unit.order.model_dump(),
        "expected_components": [c.model_dump() for c in unit.expected_components],
        "amazon_condition_scale_reference": condition_scale,
        "instructions": (
            "Report observations only, per the system instructions. "
            "The 'completeness' array in your JSON output must contain "
            "exactly one entry per item in expected_components above, in "
            "the same order, using the same part_name."
        ),
    }

    content: list[dict] = [
        {"type": "text", "text": "ORDER AND TASK CONTEXT (JSON):\n" + json.dumps(order_block, indent=2)}
    ]

    content.append({"type": "text", "text": "REFERENCE / CATALOGUE IMAGES (expected product appearance):"})
    for img in unit.reference_images():
        content.append({"type": "text", "text": f"[reference image_id={img.image_id}]"})
        content.append(_image_block(img.path))

    content.append({"type": "text", "text": "RETURNED ITEM PHOTOS (what the customer actually sent back):"})
    for img in unit.returned_images():
        content.append({"type": "text", "text": f"[returned image_id={img.image_id}]"})
        content.append(_image_block(img.path))

    content.append(
        {
            "type": "text",
            "text": (
                "Now produce the structured JSON output described in the "
                "response schema. Use the exact image_id values given "
                "above (e.g. in bounding_hints.image_ref)."
            ),
        }
    )
    return content


def _image_block(path: str) -> dict:
    p = Path(path)
    data = p.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    mime = _guess_mime(p.suffix)
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}}


def _guess_mime(suffix: str) -> str:
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }.get(suffix.lower(), "image/jpeg")


def response_json_schema() -> dict:
    """JSON schema used to force structured output from the provider,
    derived directly from the VLMResponse Pydantic model so the prompt
    contract and the validation contract can never drift apart."""
    schema = VLMResponse.model_json_schema()
    _enforce_strict_json_schema(schema)
    return schema


def _enforce_strict_json_schema(node: object) -> None:
    """Recursively normalizes a pydantic-generated JSON schema to satisfy
    OpenAI/Groq "strict" structured-output requirements:
      - every object schema must set additionalProperties: false
      - every object schema's `required` array must list ALL of its
        properties (including ones that are optional/nullable in Python —
        pydantic only lists non-default fields as required, but strict
        mode wants every key present, with optionality expressed via a
        nullable type instead of omission).

    Walks both inline schemas and $defs, since pydantic emits reusable
    sub-models (e.g. BoundingHint) as $defs entries referenced via $ref.
    """
    if isinstance(node, dict):
        if node.get("type") == "object" and "properties" in node:
            node["additionalProperties"] = False
            node["required"] = list(node["properties"].keys())
        for value in node.values():
            _enforce_strict_json_schema(value)
    elif isinstance(node, list):
        for item in node:
            _enforce_strict_json_schema(item)
