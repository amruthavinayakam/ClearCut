"""Script scan — clearance candidates from the screenplay.

Recall beats precision here. A missed element becomes a lawsuit after picture
lock; a false positive costs a coordinator thirty seconds. The agent is told to
flag its own uncertainty rather than resolve it.
"""

from __future__ import annotations

import logging
from typing import Optional

from google.adk.agents import LlmAgent
from pydantic import BaseModel, Field

from ..gemini import resolve_model
from ..models import Category, ClearanceItem, ScriptReference
from ..screenplay import ScreenplayDoc, chunk_scenes, render_scenes
from .runtime import parse_json_response, run_agent

logger = logging.getLogger(__name__)


class RawScriptReference(BaseModel):
    scene_index: int = Field(description="The SCENE number from the input header.")
    scene_heading: str = Field(description="The slugline for that scene.")
    page: Optional[int] = Field(default=None, description="Page number if shown.")
    excerpt: str = Field(description="Verbatim script text, at most two lines.")
    usage_note: str = Field(description="How it is used in this moment.")


class RawScriptCandidate(BaseModel):
    name: str = Field(description="Canonical name, e.g. 'The Velvet Room'.")
    category: Category
    description: str = Field(description="One line describing the element.")
    references: list[RawScriptReference] = Field(default_factory=list)
    specificity: str = Field(
        description="specific if the script names an identifiable work, brand, person, or "
        "place; generic if it only gestures at a type of thing ('a photograph', 'a song "
        "plays'). Generic references still matter — production will have to pick "
        "something real, and nobody will remember to clear it."
    )
    production_impact: str = Field(
        description="What it would cost the production to remove or replace this."
    )
    notes: str = Field(default="", description="Ambiguity worth a human look.")


class ScriptScanResult(BaseModel):
    candidates: list[RawScriptCandidate] = Field(default_factory=list)


INSTRUCTION = """You are a clearance analyst reading a screenplay for a film
production. Flag everything a third party may control, so a coordinator can
research it before the shoot.

Flag when the script names, quotes, shows, or plays anything owned by someone:

- **music** — songs, score, needle drops, anything sung or hummed, music described
  as playing on a radio, jukebox, phone, or in a venue
- **brand / product / signage** — named consumer brands, vehicles, devices,
  storefronts, food and drink, visible logos on wardrobe or props
- **artwork** — paintings, sculptures, photographs, murals, posters, album covers
- **real_person** — any real, identifiable human, living or dead, whether they
  appear, are impersonated, or are merely named
- **quotation** — quoted books, poems, plays, speeches, articles, lyrics
- **archival** — anything playing on a screen within a scene, news footage
- **location** — real, recognisable buildings, landmarks, and businesses
- **organization** — named real companies, institutions, teams, agencies

Rules:

1. **Recall over precision.** If unsure, flag it and say why in `notes`.
2. **Flag generic references too**, and mark them `specificity: generic`. "A
   photograph on the wall" is not clearable as written — but the art department
   will hang a real photograph, and that is exactly the element that reaches the
   edit uncleared. These are the highest-value warnings in the whole report.
3. **Merge duplicates.** One candidate per distinct thing, with every appearance
   listed as a separate reference.
4. **Quote verbatim** in `excerpt`. A coordinator has to find the line on the page.
5. **Fictional inventions of the script are not clearable** — but say so in
   `notes` if you are not certain the name is fictional.
6. Do not invent elements that are not in the text you were given.

Return JSON matching the schema. An empty list is a valid answer."""


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="script_scanner",
        model=resolve_model(),
        description="Extracts clearance candidates from screenplay pages.",
        instruction=INSTRUCTION,
        output_schema=ScriptScanResult,
        disallow_transfer_to_parent=True,
        disallow_transfer_to_peers=True,
    )


class ScriptScanError(RuntimeError):
    """Every batch failed — the scan produced nothing usable."""


def _to_item(raw: RawScriptCandidate, source_version: str) -> ClearanceItem:
    generic = raw.specificity.strip().lower().startswith("generic")
    description = raw.description
    if generic:
        description = (
            f"{description} (Script is generic here — production will substitute a "
            f"real work, which is how unscripted elements reach the edit.)"
        )

    return ClearanceItem(
        name=raw.name.strip(),
        category=raw.category,
        description=description,
        provenance="script_only",
        source_version=source_version,
        script_references=[
            ScriptReference(
                scene_index=r.scene_index,
                scene_heading=r.scene_heading,
                page=r.page,
                excerpt=r.excerpt,
                usage_note=r.usage_note,
            )
            for r in raw.references
        ],
        detection_confidence="medium" if generic else "high",
        research_priority="medium" if generic else "high",
        production_impact=raw.production_impact,
    )


def merge_items(items: list[ClearanceItem]) -> list[ClearanceItem]:
    """Fold duplicates that batching produced into one item each."""
    by_key: dict[str, ClearanceItem] = {}
    for item in items:
        key = item.name.strip().lower()
        if not key:
            continue
        existing = by_key.get(key)
        if existing is None:
            by_key[key] = item
            continue
        existing.script_references.extend(item.script_references)
        if item.production_impact and item.production_impact not in existing.production_impact:
            existing.production_impact = (
                f"{existing.production_impact} {item.production_impact}".strip()
            )

    merged = list(by_key.values())
    for item in merged:
        item.script_references.sort(key=lambda r: r.scene_index)
    merged.sort(key=lambda i: (i.category, i.name.lower()))
    return merged


async def scan_script(
    doc: ScreenplayDoc, source_version: str, on_batch=None
) -> list[ClearanceItem]:
    agent = build_agent()
    batches = chunk_scenes(doc)
    found: list[ClearanceItem] = []
    errors: list[str] = []

    for number, batch in enumerate(batches, start=1):
        prompt = (
            f'SCREENPLAY: "{doc.title}"\n'
            f"BATCH {number} of {len(batches)} — scenes {batch[0].index} to {batch[-1].index}\n\n"
            f"{render_scenes(batch)}"
        )
        try:
            raw = await run_agent(agent, prompt)
            parsed = ScriptScanResult.model_validate(parse_json_response(raw))
        except Exception as exc:  # noqa: BLE001 - a bad batch shouldn't lose the rest
            logger.exception("Script scan failed on batch %s/%s", number, len(batches))
            errors.append(f"{type(exc).__name__}: {exc}")
            if on_batch is not None:
                await on_batch(number, len(batches), 0, str(exc))
            continue

        batch_items = [
            _to_item(c, source_version) for c in parsed.candidates if c.name.strip()
        ]
        found.extend(batch_items)
        if on_batch is not None:
            await on_batch(number, len(batches), len(batch_items), None)

    # A script with nothing to clear is possible. Every batch failing is not —
    # that is credentials or model access, and calling it "no candidates" would
    # be actively misleading.
    if errors and not found and len(errors) == len(batches):
        raise ScriptScanError(
            f"All {len(batches)} script scan batch(es) failed. First error: {errors[0]}"
        )

    return merge_items(found)


def script_context_digest(items: list[ClearanceItem], limit: int = 30) -> str:
    """A short digest of script candidates, given to the cut scanner as context."""
    lines = []
    for item in items[:limit]:
        lines.append(f"- {item.name} ({item.category}): {item.description[:120]}")
    return "\n".join(lines)
