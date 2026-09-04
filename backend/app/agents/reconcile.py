"""Reconciliation — matching what was written against what was shot.

This is the product's central move. Three relationships matter:

* **in_both** — the script named it and the cut shows it. Research already
  started; confirm it is the same thing.
* **script_only** — planned but not in this cut. Cheap to drop, expensive to
  research needlessly.
* **cut_only** — it appeared on the day and nobody planned for it. Nothing has
  been researched. This is where productions get hurt.

A fourth is subtler and matters more than it looks: a script that said "a
photograph" and a cut that shows a specific titled work is **materially
changed**. The generic reference was never clearable; the specific work is.
"""

from __future__ import annotations

import logging
from typing import Optional

from google.adk.agents import LlmAgent
from pydantic import BaseModel, Field

from ..gemini import resolve_model
from ..models import Category, ClearanceItem, CutDetection, ReconciliationFinding
from .runtime import parse_json_response, run_agent

logger = logging.getLogger(__name__)


class RawMatch(BaseModel):
    script_item_id: str = Field(description="The SCRIPT id, or empty string if unmatched.")
    cut_detection_id: str = Field(description="The CUT id, or empty string if unmatched.")
    relationship: str = Field(
        description="in_both | script_only | cut_only | materially_changed"
    )
    explanation: str = Field(
        description="One sentence a coordinator can act on, naming the specific difference."
    )


class ReconciliationResult(BaseModel):
    matches: list[RawMatch] = Field(default_factory=list)


INSTRUCTION = """You are reconciling a screenplay against a rough cut for a film
production's clearance record.

You are given SCRIPT candidates (things the screenplay mentioned) and CUT
detections (things actually visible or audible in the edit). Decide how they
relate.

Produce exactly one entry for every SCRIPT id and every CUT id. An id may appear
in only one entry.

Relationships:

- **in_both** — the same element. The script named it and the cut shows it. Pair
  the ids.
- **materially_changed** — the script referred to this *generically* ("a
  photograph on the wall", "a song plays", "a beer") and the cut shows a
  *specific, identifiable* work, brand, or recording. Pair the ids. This is the
  most important relationship you can identify: the generic reference required no
  clearance, the specific one does, and nobody was warned.
- **script_only** — a script candidate with no corresponding element in the cut.
  Leave `cut_detection_id` empty.
- **cut_only** — an element in the cut that the script never mentioned, not even
  generically. Leave `script_item_id` empty. Treat this as significant: no
  clearance research exists for it.

Judgement rules:

1. Match on identity, not wording. "The Velvet Room" in the script and a neon
   sign reading "THE VELVET ROOM" are the same element.
2. Do not force matches. If a cut element merely resembles a script element in
   category, that is not a match — a beer in the script and a cola in the cut are
   two different products, so the cola is `cut_only` and the beer is
   `script_only`.
3. A generic script mention paired with a specific cut element is
   `materially_changed`, never `in_both`.
4. When genuinely uncertain, prefer `cut_only` for the cut element. Over-warning
   is cheap; a missed unscripted element is not.

Return JSON matching the schema."""


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="version_reconciler",
        model=resolve_model(),
        description="Relates screenplay candidates to rough-cut detections.",
        instruction=INSTRUCTION,
        output_schema=ReconciliationResult,
        disallow_transfer_to_parent=True,
        disallow_transfer_to_peers=True,
    )


def _render_inputs(
    script_items: list[ClearanceItem],
    cut_rows: list[tuple[str, Category, CutDetection, str]],
) -> str:
    script_lines = []
    for item in script_items:
        refs = "; ".join(
            f"scene {r.scene_index}: \"{r.excerpt.strip()[:100]}\""
            for r in item.script_references[:2]
        )
        script_lines.append(
            f"  [{item.id}] {item.name} ({item.category}) — {item.description[:160]}\n"
            f"       {refs}"
        )

    cut_lines = []
    for index, (name, category, detection, text) in enumerate(cut_rows):
        cut_lines.append(
            f"  [cut-{index}] {name} ({category}) at {detection.timecode.label()}\n"
            f"       observed: {detection.observation[:160]}\n"
            f"       on-screen text: {text or '(none)'}"
        )

    return (
        f"SCRIPT CANDIDATES ({len(script_items)}):\n"
        + ("\n".join(script_lines) or "  (none)")
        + f"\n\nCUT DETECTIONS ({len(cut_rows)}):\n"
        + ("\n".join(cut_lines) or "  (none)")
    )


async def reconcile(
    script_items: list[ClearanceItem],
    cut_rows: list[tuple[str, Category, CutDetection, str]],
    cut_version: str,
) -> tuple[list[ClearanceItem], list[ReconciliationFinding]]:
    """Merge script candidates and cut detections into one item list.

    Returns the reconciled items and the findings that explain the relationships.
    """
    if not cut_rows:
        findings = [
            ReconciliationFinding(
                kind="script_only",
                item_id=item.id,
                item_name=item.name,
                explanation="No rough cut has been analysed yet.",
            )
            for item in script_items
        ]
        return script_items, findings

    by_script_id = {item.id: item for item in script_items}
    matches: list[RawMatch] = []

    if script_items:
        try:
            raw = await run_agent(
                build_agent(), _render_inputs(script_items, cut_rows)
            )
            matches = ReconciliationResult.model_validate(parse_json_response(raw)).matches
        except Exception:  # noqa: BLE001 - fall back to treating everything as unmatched
            logger.exception("Reconciliation agent failed; treating all cut items as unscripted")
            matches = []

    findings: list[ReconciliationFinding] = []
    matched_cut: set[int] = set()
    matched_script: set[str] = set()

    def cut_index(token: str) -> Optional[int]:
        if not token.startswith("cut-"):
            return None
        try:
            index = int(token.split("-", 1)[1])
        except ValueError:
            return None
        return index if 0 <= index < len(cut_rows) else None

    for match in matches:
        relationship = match.relationship.strip().lower()
        script_id = match.script_item_id.strip()
        index = cut_index(match.cut_detection_id.strip())

        if relationship in {"in_both", "materially_changed"} and script_id in by_script_id and index is not None:
            item = by_script_id[script_id]
            name, category, detection, text = cut_rows[index]
            detection.expected_from_script = True
            item.cut_detections.append(detection)
            item.provenance = "both"
            item.source_version = cut_version
            if text and text not in item.description:
                item.description = f"{item.description} On screen: {text}".strip()

            if relationship == "materially_changed":
                # The script's generic mention is not the thing that needs
                # clearing — the specific work now on screen is.
                item.name = name
                item.category = category
                item.detection_confidence = detection.confidence
                item.research_priority = "high"

            matched_script.add(script_id)
            matched_cut.add(index)
            findings.append(
                ReconciliationFinding(
                    kind="materially_changed" if relationship == "materially_changed" else "in_both",
                    item_id=item.id,
                    item_name=item.name,
                    explanation=match.explanation,
                )
            )

    # Anything the agent did not pair becomes its own finding.
    items = list(script_items)

    for item in script_items:
        if item.id in matched_script:
            continue
        findings.append(
            ReconciliationFinding(
                kind="script_only",
                item_id=item.id,
                item_name=item.name,
                explanation="Present in the screenplay but not detected in this cut.",
            )
        )

    for index, (name, category, detection, text) in enumerate(cut_rows):
        if index in matched_cut:
            continue
        description = f"Detected in the cut at {detection.timecode.label()}."
        if text:
            description += f" On screen: {text}"
        item = ClearanceItem(
            name=name,
            category=category,
            description=description,
            provenance="cut_only",
            source_version=cut_version,
            cut_detections=[detection],
            detection_confidence=detection.confidence,
            # Unscripted means unresearched. It goes to the top of the queue.
            research_priority="high",
            production_impact="Entered through the filmed material; no prior clearance research exists.",
        )
        item.log(
            "detected_unscripted",
            actor="agent",
            rationale="Element appears in the cut but not in the screenplay.",
            detail={"timecode": detection.timecode.model_dump()},
        )
        items.append(item)
        findings.append(
            ReconciliationFinding(
                kind="cut_only",
                item_id=item.id,
                item_name=item.name,
                explanation="Not in the screenplay — entered through production and has never been researched.",
            )
        )

    # Unscripted first, then materially changed, then everything else: the
    # queue should open on what nobody planned for. `provenance` only tracks
    # in_both/cut_only/script_only, so materially-changed items (provenance
    # "both") need their own lookup rather than a provenance-keyed bucket.
    materially_changed_ids = {
        f.item_id for f in findings if f.kind == "materially_changed"
    }

    def sort_key(item: ClearanceItem) -> tuple[int, str]:
        if item.provenance == "cut_only":
            rank = 0
        elif item.id in materially_changed_ids:
            rank = 1
        elif item.provenance == "both":
            rank = 2
        else:
            rank = 3
        return (rank, item.name.lower())

    items.sort(key=sort_key)
    return items, findings
