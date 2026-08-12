"""Thin helper for driving an ADK agent to a single final response.

ADK is built around streaming multi-turn sessions. Most of our pipeline steps
are one-shot transforms, so this wraps the Runner/session dance into an
awaitable that returns the final text.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any, Optional

from google.adk.agents import LlmAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

logger = logging.getLogger(__name__)

APP_NAME = "clearcut"

_session_service = InMemorySessionService()


async def run_agent(
    agent: LlmAgent,
    prompt: str,
    *,
    user_id: str = "clearcut",
    session_id: Optional[str] = None,
    state: Optional[dict[str, Any]] = None,
) -> str:
    """Run `agent` over `prompt` and return the final response text."""
    session_id = session_id or f"s-{uuid.uuid4().hex[:12]}"
    runner = Runner(
        app_name=APP_NAME,
        agent=agent,
        session_service=_session_service,
        auto_create_session=True,
    )
    message = types.Content(role="user", parts=[types.Part(text=prompt)])

    chunks: list[str] = []
    try:
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=message,
            state_delta=state,
        ):
            if not event.is_final_response():
                continue
            content = getattr(event, "content", None)
            for part in getattr(content, "parts", None) or []:
                text = getattr(part, "text", None)
                if text:
                    chunks.append(text)
    finally:
        await runner.close()

    return "".join(chunks).strip()


_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def parse_json_response(raw: str) -> Any:
    """Parse a model response that should be JSON.

    ADK's `output_schema` normally guarantees clean JSON, but a model that
    falls back to prose or wraps its answer in a fence shouldn't take down a
    120-page analysis, so we degrade rather than raise.
    """
    if not raw:
        raise ValueError("Empty model response")

    candidates = [raw.strip()]
    fenced = _FENCE.search(raw)
    if fenced:
        candidates.insert(0, fenced.group(1).strip())

    # Last resort: the outermost {...} or [...] span.
    for opener, closer in (("{", "}"), ("[", "]")):
        start = raw.find(opener)
        end = raw.rfind(closer)
        if start != -1 and end > start:
            candidates.append(raw[start : end + 1])

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

    raise ValueError(f"Could not parse JSON from model response: {raw[:300]}")
