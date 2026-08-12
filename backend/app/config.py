"""Runtime configuration, read from the environment at instantiation."""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()


def _str(name: str, default: str = "") -> str:
    return os.getenv(name, default)


def _int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


# Defaults are factories so the environment is read when Settings is
# instantiated, not when this module is imported.
class Settings(BaseModel):
    # --- Google Cloud / Vertex AI ---
    google_cloud_project: str = Field(default_factory=lambda: _str("GOOGLE_CLOUD_PROJECT"))
    google_cloud_location: str = Field(
        default_factory=lambda: _str("GOOGLE_CLOUD_LOCATION", "global")
    )
    use_vertex: bool = Field(default_factory=lambda: _flag("GOOGLE_GENAI_USE_VERTEXAI", True))
    google_api_key: str = Field(default_factory=lambda: _str("GOOGLE_API_KEY"))

    gemini_model: str = Field(default_factory=lambda: _str("GEMINI_MODEL"))
    model_candidates: list[str] = Field(
        default_factory=lambda: [
            "gemini-3-pro",
            "gemini-3-pro-preview",
            "gemini-3-flash",
            "gemini-2.5-pro",
            "gemini-2.5-flash",
        ]
    )

    # Cloud Storage holds uploaded cuts so Gemini can read them by URI rather
    # than us shipping tens of megabytes inline on every call.
    gcs_bucket: str = Field(default_factory=lambda: _str("GCS_BUCKET"))

    # --- Parallel ---
    parallel_api_key: str = Field(default_factory=lambda: _str("PARALLEL_API_KEY"))
    # Search: fast, live retrieval shown directly in the UI.
    parallel_search_mode: str = Field(default_factory=lambda: _str("PARALLEL_SEARCH_MODE", "basic"))
    parallel_search_max_chars: int = Field(
        default_factory=lambda: _int("PARALLEL_SEARCH_MAX_CHARS", 12000)
    )
    # Task: structured dossier per item.
    parallel_processor: str = Field(default_factory=lambda: _str("PARALLEL_PROCESSOR", "core"))
    parallel_monitor_processor: str = Field(
        default_factory=lambda: _str("PARALLEL_MONITOR_PROCESSOR", "base")
    )
    parallel_timeout_s: int = Field(default_factory=lambda: _int("PARALLEL_TIMEOUT_S", 900))
    # A `core` run takes ~3-4 minutes; this decides whether a project finishes
    # in five minutes or forty. The work is I/O-bound, so high costs us nothing.
    research_concurrency: int = Field(default_factory=lambda: _int("RESEARCH_CONCURRENCY", 16))

    # --- Persistence ---
    firestore_collection: str = Field(
        default_factory=lambda: _str("FIRESTORE_COLLECTION", "clearance_projects")
    )
    use_firestore: bool = Field(default_factory=lambda: _flag("USE_FIRESTORE", False))

    # --- Server ---
    port: int = Field(default_factory=lambda: _int("PORT", 8080))
    public_base_url: str = Field(default_factory=lambda: _str("PUBLIC_BASE_URL"))
    webhook_secret: str = Field(default_factory=lambda: _str("PARALLEL_WEBHOOK_SECRET"))
    max_upload_bytes: int = Field(
        default_factory=lambda: _int("MAX_UPLOAD_BYTES", 200 * 1024 * 1024)
    )

    # Demo mode: serve fixture research instead of billing the Parallel API.
    mock_research: bool = Field(default_factory=lambda: _flag("MOCK_RESEARCH", False))

    @property
    def parallel_configured(self) -> bool:
        return bool(self.parallel_api_key) or self.mock_research

    def apply_genai_env(self) -> None:
        """ADK and google-genai read these from the process environment."""
        if self.use_vertex:
            os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "TRUE"
            if self.google_cloud_project:
                os.environ["GOOGLE_CLOUD_PROJECT"] = self.google_cloud_project
            os.environ["GOOGLE_CLOUD_LOCATION"] = self.google_cloud_location
        else:
            os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "FALSE"
            if self.google_api_key:
                os.environ["GOOGLE_API_KEY"] = self.google_api_key


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.apply_genai_env()
    return settings
