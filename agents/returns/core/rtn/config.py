"""Runtime configuration, loaded from environment / .env.

Kept intentionally small for Day 1: one provider, one model, local file
evidence store. Extend as later days add fusion models, a real DB, etc.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(REPO_ROOT / ".env"), extra="ignore")

    # Provider-neutral: any OpenAI-compatible chat completions endpoint
    # works here (OpenAI itself, Groq, Azure OpenAI, a local gateway, etc).
    # Day 1 default targets Groq since that's the key available for this
    # build, but nothing in rtn/perception/vlm_client.py is Groq-specific.
    vlm_api_key: str = ""
    vlm_base_url: str = "https://api.groq.com/openai/v1"
    # Read from VLM_MODEL_GROQ, not VLM_MODEL: the Pack agent already uses VLM_MODEL for its Gemini model name,
    # and both agents run in the same process.
    vlm_model: str = Field("qwen/qwen3.8-27b", validation_alias="VLM_MODEL_GROQ")
    vlm_timeout_seconds: float = 45.0
    vlm_max_retries: int = 2

    evidence_store_dir: Path = REPO_ROOT / "evidence_store"

    default_organization_id: str = "org-demo"
    default_client_id: str = "client-demo"


def get_settings() -> Settings:
    return Settings()


settings = get_settings()
