"""VLM client wrapper.

Responsibilities:
- Make exactly ONE batched multimodal call per unit (no per-check calls).
- Force structured JSON output matching VLMResponse.
- Validate the raw response against the schema before anything downstream
  touches it.
- Fail open: on provider error, timeout, or JSON/schema validation failure
  (after retries), never raise past this layer in a way that would drop
  the case. Instead return a PerceptionResult with ok=False and a reason,
  so the pipeline can write a PENDING evidence record and preserve input.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from openai import APIError, APITimeoutError, OpenAI
from pydantic import ValidationError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from agents.returns.core.rtn.config import settings
from agents.returns.core.rtn.perception.prompt_builder import SYSTEM_INSTRUCTIONS, build_user_content, response_json_schema
from agents.returns.core.rtn.schemas.input import UnitInput
from agents.returns.core.rtn.schemas.vlm_output import VLMResponse


@dataclass
class PerceptionResult:
    ok: bool
    response: VLMResponse | None
    model_version: str
    latency_ms: int
    raw_text: str | None = None
    error: str | None = None


class VLMClient:
    def __init__(self, client: OpenAI | None = None) -> None:
        # Any OpenAI-compatible provider works here (OpenAI, Groq, Azure
        # OpenAI, etc) — only base_url/api_key/model need to change.
        self._client = client or OpenAI(
            api_key=settings.vlm_api_key, base_url=settings.vlm_base_url
        )
        self._model = settings.vlm_model

    def evaluate_unit(self, unit: UnitInput) -> PerceptionResult:
        """Runs the single batched perception call for one unit.
        Fails open: any exception here is caught and converted into a
        PerceptionResult(ok=False, ...) rather than propagated, so the
        caller can always preserve the case.
        """
        start = time.monotonic()
        try:
            raw_text = self._call_with_retries(unit)
        except Exception as exc:  # noqa: BLE001 — deliberate fail-open boundary
            latency_ms = int((time.monotonic() - start) * 1000)
            return PerceptionResult(
                ok=False,
                response=None,
                model_version=self._model,
                latency_ms=latency_ms,
                raw_text=None,
                error=f"{type(exc).__name__}: {exc}",
            )

        latency_ms = int((time.monotonic() - start) * 1000)

        try:
            parsed = VLMResponse.model_validate_json(raw_text)
        except ValidationError as exc:
            return PerceptionResult(
                ok=False,
                response=None,
                model_version=self._model,
                latency_ms=latency_ms,
                raw_text=raw_text,
                error=f"schema_validation_failed: {exc}",
            )

        return PerceptionResult(
            ok=True,
            response=parsed,
            model_version=self._model,
            latency_ms=latency_ms,
            raw_text=raw_text,
        )

    def _call_with_retries(self, unit: UnitInput) -> str:
        @retry(
            reraise=True,
            stop=stop_after_attempt(settings.vlm_max_retries + 1),
            wait=wait_exponential(multiplier=1, min=1, max=8),
            retry=retry_if_exception_type((APITimeoutError, APIError)),
        )
        def _do_call() -> str:
            completion = self._client.chat.completions.create(
                model=self._model,
                timeout=settings.vlm_timeout_seconds,
                messages=[
                    {"role": "system", "content": SYSTEM_INSTRUCTIONS},
                    {"role": "user", "content": build_user_content(unit)},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "vlm_response",
                        "schema": response_json_schema(),
                        "strict": True,
                    },
                },
            )
            content = completion.choices[0].message.content
            if not content:
                raise ValueError("empty response content from VLM provider")
            return content

        return _do_call()
