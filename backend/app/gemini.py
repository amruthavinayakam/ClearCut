"""Vertex AI model resolution.

Gemini model ids rotate faster than a hackathon repo can keep up with, and a
demo that dies on `404 model not found` is a bad demo. So we probe a candidate
list once at startup against the caller's own project and cache what works.
"""

from __future__ import annotations

import logging

from google import genai

from .config import get_settings

logger = logging.getLogger(__name__)

_resolved: str | None = None


def _client() -> genai.Client:
    settings = get_settings()
    if settings.use_vertex:
        return genai.Client(
            vertexai=True,
            project=settings.google_cloud_project or None,
            location=settings.google_cloud_location,
        )
    return genai.Client(api_key=settings.google_api_key or None)


def _works(client: genai.Client, model: str) -> bool:
    try:
        client.models.generate_content(
            model=model,
            contents="ping",
            config={"max_output_tokens": 8},
        )
        return True
    except Exception as exc:  # noqa: BLE001 - any failure means "try the next one"
        logger.info("Model %s unavailable: %s", model, str(exc)[:200])
        return False


def resolve_model() -> str:
    """Return a model id this project can actually serve.

    An explicit GEMINI_MODEL is trusted without a probe so operators can pin a
    model we've never heard of.
    """
    global _resolved
    if _resolved:
        return _resolved

    settings = get_settings()
    if settings.gemini_model:
        _resolved = settings.gemini_model
        logger.info("Using pinned Gemini model %s", _resolved)
        return _resolved

    client = _client()
    for candidate in settings.model_candidates:
        if _works(client, candidate):
            _resolved = candidate
            logger.info("Resolved Gemini model to %s", candidate)
            return candidate

    # Nothing answered. Fall back to the first candidate so the error surfaces
    # at call time with a real Vertex message rather than a vague one here.
    _resolved = settings.model_candidates[0]
    logger.warning(
        "No candidate model responded; falling back to %s. "
        "Check GOOGLE_CLOUD_PROJECT, location, and that Vertex AI API is enabled.",
        _resolved,
    )
    return _resolved


def reset_cache() -> None:
    global _resolved
    _resolved = None
