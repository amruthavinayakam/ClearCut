"""Permission-request drafting.

Prepares outreach. Never sends it. The draft is written to the item and shown
to the coordinator, who owns the decision to contact anyone at all.
"""

from __future__ import annotations

from google.adk.agents import LlmAgent

from ..gemini import resolve_model
from ..models import ClearanceItem
from .runtime import run_agent

INSTRUCTION = """You draft permission requests for a film production's clearance
coordinator. Your drafts are reviewed and sent by a human — never by you.

Write a short, professional email requesting permission to use the element
described. Structure:

1. Who is writing and what the production is (one sentence).
2. Exactly what is being requested — the specific work, and how it appears.
3. The intended use: media, territory, and term. Where these are unknown, write
   a clearly bracketed placeholder like [TERRITORY] for the coordinator to fill.
4. A request for their licensing terms and process.
5. A courteous close.

Rules:

- Never assert that permission has been granted, or that the production has any
  right to use the element.
- Never invent the rights holder's name, a fee, a prior conversation, or a
  deadline. Use bracketed placeholders for anything not supplied to you.
- Do not claim fair use or make any legal argument.
- Keep it under 200 words. Coordinators send dozens of these.

Output only the email — a subject line, then the body. No commentary."""


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="permission_drafter",
        model=resolve_model(),
        description="Drafts permission-request emails for coordinator review.",
        instruction=INSTRUCTION,
    )


async def draft_permission_request(
    item: ClearanceItem, production_title: str, tone: str = "professional"
) -> str:
    holder = item.candidate_rights_holders[0] if item.candidate_rights_holders else None
    route = item.licensing_routes[0] if item.licensing_routes else None

    where = []
    for ref in item.script_references[:2]:
        where.append(f"Script scene {ref.scene_index}: {ref.usage_note}")
    for det in item.cut_detections[:2]:
        where.append(f"Cut {det.timecode.label()}: {det.observation[:160]}")

    prompt = f"""PRODUCTION: "{production_title}"
ELEMENT: {item.name} ({item.category})
DESCRIPTION: {item.description}

HOW IT APPEARS:
{chr(10).join(f"  - {w}" for w in where) or "  (not specified)"}

ADDRESSEE: {holder.name if holder else "[RIGHTS HOLDER — not yet established]"}
THEIR ROLE: {holder.role if holder else "unknown"}
RIGHTS SOUGHT: {", ".join(holder.rights_implicated) if holder and holder.rights_implicated else "[RIGHTS SOUGHT]"}
KNOWN ROUTE: {route.route if route else "no public licensing route identified"}

TONE: {tone}

Draft the request."""

    return await run_agent(build_agent(), prompt, session_id=f"draft-{item.id}")
