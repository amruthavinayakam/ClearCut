"""Clearance copilot — a tool-using ADK agent over the project.

Holds a live Parallel Search tool, so when the answer is not already in the
evidence the agent goes and finds it with citations rather than guessing. It
cannot change any item's status; that surface is deliberately not exposed to it.
"""

from __future__ import annotations

import logging
from typing import Any

from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool

from ..config import get_settings
from ..gemini import resolve_model
from ..models import Project
from .runtime import run_agent

logger = logging.getLogger(__name__)


async def parallel_live_search(question: str) -> dict[str, Any]:
    """Search the live web for current information about a rights or clearance question.

    Use this whenever the evidence in the project does not already answer the
    question, or when asked whether something has changed recently.

    Args:
        question: A specific, self-contained search query. Name the work, brand,
            or person explicitly — this tool has no memory of the conversation.

    Returns:
        A dict with `results`, a list of {url, title, excerpt}.
    """
    settings = get_settings()
    if settings.mock_research:
        return {
            "results": [],
            "note": "[MOCK MODE] Live search is disabled. Set PARALLEL_API_KEY and "
            "MOCK_RESEARCH=false to query Parallel.",
        }

    from ..parallel_client import get_client

    try:
        result = await get_client().search(
            search_queries=[question],
            objective=(
                "Find current, citable information for a film clearance coordinator. "
                "Prefer official licensing pages, rights-society registries, and primary "
                "sources."
            ),
            mode=settings.parallel_search_mode,  # type: ignore[arg-type]
            max_chars_total=settings.parallel_search_max_chars,
        )
    except Exception as exc:  # noqa: BLE001 - report to the model, don't crash the turn
        logger.exception("Copilot search failed")
        return {"results": [], "error": f"{type(exc).__name__}: {exc}"}

    rows = []
    for row in getattr(result, "results", None) or []:
        data = row if isinstance(row, dict) else row.model_dump()
        if not data.get("url"):
            continue
        excerpts = [e for e in (data.get("excerpts") or []) if e]
        rows.append(
            {
                "url": data["url"],
                "title": data.get("title") or data["url"],
                "excerpt": (excerpts[0][:600] if excerpts else ""),
            }
        )
    return {"results": rows[:10]}


INSTRUCTION_HEADER = """You are Clearance Radar's copilot, advising a film
production's clearance coordinator. They need decisions and next steps, not essays.

How to work:

- Answer from the project evidence below when it covers the question, naming the
  item you are drawing on.
- Call `parallel_live_search` whenever the evidence does not cover it, whenever
  asked if something changed, or whenever you would otherwise be guessing.
- Never invent a rights holder, fee, contact, or legal conclusion. Say what is
  unknown and offer to research it.
- Cite source URLs whenever your answer rests on researched facts.
- **You cannot approve anything.** If asked to clear, approve, or sign off an
  item, explain that approval belongs to the coordinator or counsel and that you
  can only assemble evidence. This is a hard limit, not a preference.
- You are not a lawyer and this is not legal advice. Say so when asked for a
  legal conclusion, not on every reply.
- Be concise. Lead with the answer.

--- PROJECT EVIDENCE ---
"""


def render_context(project: Project, limit: int = 40) -> str:
    if not project.items:
        return "(no items analysed yet)"

    lines = [
        f'PRODUCTION: "{project.title}"',
        f"SCRIPT: {project.script.label if project.script else 'none'}   "
        f"CUT: {project.cut.label if project.cut else 'none'}",
        f"ITEMS: {len(project.items)}",
        "",
    ]
    order = {"cut_only": 0, "both": 1, "script_only": 2}
    for item in sorted(project.items, key=lambda i: order.get(i.provenance, 3))[:limit]:
        flag = " [UNSCRIPTED]" if item.provenance == "cut_only" else ""
        lines.append(
            f"[{item.workflow_status}] {item.name} ({item.category}){flag}"
        )
        if item.cut_detections:
            lines.append(
                f"    on screen: {', '.join(d.timecode.label() for d in item.cut_detections[:3])}"
            )
        for holder in item.candidate_rights_holders[:3]:
            lines.append(
                f"    candidate: {holder.name} ({holder.role}, confidence {holder.confidence})"
            )
        if item.evidence_gaps:
            lines.append(f"    gaps: {'; '.join(item.evidence_gaps[:2])}")
        if item.recommended_actions:
            lines.append(f"    next: {item.recommended_actions[0]}")
        lines.append("")

    if len(project.items) > limit:
        lines.append(f"... and {len(project.items) - limit} further items.")
    return "\n".join(lines)


def build_agent(project: Project) -> LlmAgent:
    return LlmAgent(
        name="clearance_copilot",
        model=resolve_model(),
        description="Answers clearance questions about an analysed production.",
        instruction=INSTRUCTION_HEADER + render_context(project),
        tools=[FunctionTool(parallel_live_search)],
    )


async def ask(project: Project, question: str, session_id: str) -> str:
    return await run_agent(
        build_agent(project), question, session_id=session_id, user_id=f"proj-{project.id}"
    )
