"""The Clearance Radar pipeline.

Deterministic stages, in fixed order, every run:

    parse script -> scan script -> scan cut -> reconcile -> research -> ready

Within research, each item goes through Parallel **Search** first and then
Parallel **Task**. That order is deliberate: Search is fast enough to show a
coordinator live retrieval within seconds, so the UI has real cited URLs on
screen long before the structured dossier lands.

The agent advances items to `evidence_ready` and no further. Every status past
that point belongs to a human.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .agents.cut_scan import scan_cut
from .agents.reconcile import reconcile
from .agents.script_scan import scan_script, script_context_digest
from .models import ClearanceItem, CutVersion, Project, ScriptVersion
from .parallel_client import (
    ParallelSearchError,
    apply_dossier,
    build_dossier,
    search_evidence,
)
from .screenplay import parse_screenplay
from .store import store

logger = logging.getLogger(__name__)


async def _emit(project: Project, phase, message: str, **detail) -> None:
    project.phase = phase
    project.updated_at = datetime.now(timezone.utc).isoformat()
    await store.put(project)
    store.publish(
        project.id,
        {"type": "progress", "phase": phase, "message": message, "detail": detail},
    )
    logger.info("[%s] %s: %s", project.id, phase, message)


async def run_pipeline(
    project_id: str,
    script_bytes: Optional[bytes],
    script_name: Optional[str],
    video_path: Optional[Path],
    video_name: Optional[str],
    video_duration: float,
) -> None:
    project = await store.get(project_id)
    if project is None:
        logger.error("Pipeline started for unknown project %s", project_id)
        return

    try:
        script_items: list[ClearanceItem] = []
        script_digest = ""

        # -- 1. script ------------------------------------------------------
        if script_bytes and script_name:
            await _emit(project, "scanning_script", f"Reading {script_name}")
            doc = parse_screenplay(script_bytes, script_name)
            version = ScriptVersion(
                label=f"script-v{len(project.script_history) + 1}",
                filename=script_name,
                title=doc.title,
                page_count=doc.page_count,
                scene_count=len(doc.scenes),
            )
            project.script = version
            project.script_history.append(version)
            project.title = doc.title
            await _emit(
                project,
                "scanning_script",
                f'Parsed "{doc.title}" — {len(doc.scenes)} scenes, {doc.page_count} pages',
                scenes=len(doc.scenes),
                pages=doc.page_count,
            )

            async def on_batch(number: int, total: int, found: int, error: Optional[str]) -> None:
                message = (
                    f"Script batch {number}/{total} failed — {error}"
                    if error
                    else f"Scanned script batch {number}/{total} — {found} candidate(s)"
                )
                await _emit(project, "scanning_script", message)

            script_items = await scan_script(doc, version.label, on_batch=on_batch)
            script_digest = script_context_digest(script_items)
            await _emit(
                project,
                "scanning_script",
                f"{len(script_items)} candidate(s) found in the screenplay",
                count=len(script_items),
            )

        # -- 2. cut ---------------------------------------------------------
        cut_rows = []
        cut_label = ""
        if video_path is not None and video_name:
            cut_version = CutVersion(
                label=f"rough-cut-v{len(project.cut_history) + 1}",
                filename=video_name,
                duration_s=video_duration,
                media_url=f"/api/projects/{project.id}/cut",
            )
            project.cut = cut_version
            project.cut_history.append(cut_version)
            cut_label = cut_version.label

            await _emit(
                project,
                "scanning_cut",
                f"Analysing {video_name} ({video_duration:.0f}s) with Gemini",
            )
            cut_rows, notes = await scan_cut(
                video_path,
                project.title,
                video_duration,
                gcs_uri=cut_version.gcs_uri,
                script_context=script_digest,
            )
            await _emit(
                project,
                "scanning_cut",
                f"{len(cut_rows)} element(s) detected in the cut",
                count=len(cut_rows),
                notes=notes,
                detections=[
                    {
                        "name": name,
                        "category": category,
                        "start": detection.timecode.start,
                        "end": detection.timecode.end,
                    }
                    for name, category, detection, _ in cut_rows
                ],
            )

        # -- 3. reconcile ---------------------------------------------------
        await _emit(project, "reconciling", "Comparing the page against the screen")
        items, findings = await reconcile(script_items, cut_rows, cut_label or "script only")
        project.items = items
        project.reconciliation = findings

        unscripted = sum(1 for f in findings if f.kind == "cut_only")
        changed = sum(1 for f in findings if f.kind == "materially_changed")
        await _emit(
            project,
            "reconciling",
            (
                f"{len(items)} clearance item(s) — {unscripted} unscripted, "
                f"{changed} materially changed"
            ),
            unscripted=unscripted,
            changed=changed,
            findings=[f.model_dump() for f in findings],
        )

        if not items:
            project.phase = "ready"
            await store.put(project)
            store.publish(project.id, {"type": "done", "phase": "ready"})
            return

        # -- 4. research ----------------------------------------------------
        await _emit(
            project,
            "researching",
            f"Researching {len(items)} item(s) — Parallel Search, then Task",
            total=len(items),
        )
        await _research_all(project, items)

        project.phase = "ready"
        project.log(
            "project_ready",
            actor="agent",
            rationale="Evidence assembled. All approval decisions remain with the coordinator.",
        )
        await store.put(project)
        summary = project.summary()
        await _emit(project, "ready", "Evidence ready for review", **summary)
        store.publish(project.id, {"type": "done", "phase": "ready", "summary": summary})

    except Exception as exc:  # noqa: BLE001 - surface the failure to the client
        logger.exception("Pipeline failed for project %s", project_id)
        project.phase = "failed"
        project.error = f"{type(exc).__name__}: {exc}"
        await store.put(project)
        store.publish(
            project.id, {"type": "error", "phase": "failed", "message": project.error}
        )


async def _research_all(project: Project, items: list[ClearanceItem]) -> None:
    from .config import get_settings

    settings = get_settings()
    semaphore = asyncio.Semaphore(max(1, settings.research_concurrency))

    async def research_one(item: ClearanceItem) -> None:
        async with semaphore:
            await research_item(project, item)

    await asyncio.gather(*(research_one(item) for item in items))


async def research_item(project: Project, item: ClearanceItem) -> None:
    """Search, then dossier, then hand to a human. Never sets an approval state."""
    if not item.has_human_decision:
        item.transition(
            "researching",
            actor="agent",
            rationale="Automated evidence gathering started.",
        )
        store.publish(
            project.id,
            {"type": "item_status", "item_id": item.id, "status": item.workflow_status},
        )

    # --- Parallel Search: live retrieval, surfaced immediately ---
    try:
        sources = await search_evidence(item, project.title, session_id=project.id)
        item.sources.extend(sources)
        item.log(
            "parallel_search",
            actor="agent",
            rationale=f"Retrieved {len(sources)} live source(s).",
            detail={"urls": [s.url for s in sources][:12]},
        )
        store.publish(
            project.id,
            {
                "type": "search_results",
                "item_id": item.id,
                "item_name": item.name,
                "sources": [
                    {"url": s.url, "title": s.title, "excerpt": s.excerpt[:220]}
                    for s in sources[:8]
                ],
            },
        )
    except ParallelSearchError as exc:
        sources = []
        item.log(
            "parallel_search_failed",
            actor="agent",
            rationale=str(exc),
        )
        store.publish(
            project.id,
            {"type": "search_failed", "item_id": item.id, "message": str(exc)},
        )

    # --- Parallel Task: structured dossier ---
    dossier = await build_dossier(item, project.title, sources)
    apply_dossier(item, dossier)

    # A coordinator may have reviewed this item while research was still in
    # flight. Their decision wins; we keep the new evidence and leave the
    # status alone.
    if item.has_human_decision:
        item.log(
            "research_completed_after_human_review",
            actor="agent",
            rationale=(
                "Evidence updated, but status left unchanged because a human has "
                f"already acted on this item (currently '{item.workflow_status}')."
            ),
        )
    elif item.research_error:
        item.transition(
            "unresolved",
            actor="agent",
            rationale=f"Structured research failed: {item.research_error}",
        )
    elif not item.candidate_rights_holders:
        # No holder found is a finding, not a pass. It can never be green.
        item.transition(
            "unresolved",
            actor="agent",
            rationale="No candidate rights holder could be established from public sources.",
        )
    else:
        item.transition(
            "evidence_ready",
            actor="agent",
            rationale=(
                f"{len(item.candidate_rights_holders)} candidate rights holder(s) and "
                f"{item.citation_count} source(s) assembled. Awaiting coordinator review."
            ),
        )

    await store.put(project)
    store.publish(
        project.id,
        {
            "type": "item_researched",
            "item_id": item.id,
            "item_name": item.name,
            "status": item.workflow_status,
            "color": item.color,
            "citations": item.citation_count,
            "holders": len(item.candidate_rights_holders),
        },
    )


async def start_project(
    script_bytes: Optional[bytes],
    script_name: Optional[str],
    video_path: Optional[Path],
    video_name: Optional[str],
    video_duration: float,
    title: str = "Untitled production",
) -> Project:
    project = Project(title=title)
    project.log("project_created", actor="coordinator", rationale="Upload received.")
    await store.put(project)
    asyncio.create_task(
        run_pipeline(
            project.id, script_bytes, script_name, video_path, video_name, video_duration
        )
    )
    return project
