"""Clearance Radar HTTP API."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .assets import StoredAsset, get_asset_store
from .config import get_settings
from .export import to_markdown
from .models import Actor, ApprovalDenied, Project, ProductionDocument, WorkflowStatus
from .pipeline import start_project
from .screenplay import ScreenplayParseError
from .store import store

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)-8s %(name)s: %(message)s"
)
logger = logging.getLogger("clearance-radar")

settings = get_settings()

app = FastAPI(
    title="Clearance Radar",
    description="Multimodal clearance research and rights coordination.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

SAMPLES = Path(__file__).parent / "samples"
SAMPLE_SCRIPT = SAMPLES / "the_long_way_down.fountain"
SAMPLE_CUT = SAMPLES / "the_long_way_down_roughcut.mp4"
STATIC_DIR = Path(__file__).parent / "static"
asset_store = get_asset_store()


# --------------------------------------------------------------------------
# Meta
# --------------------------------------------------------------------------


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {"status": "ok"}


@app.get("/api/config")
async def config() -> dict[str, Any]:
    return {
        "mock_research": settings.mock_research,
        "parallel_configured": settings.parallel_configured,
        "vertex": settings.use_vertex,
        "project": settings.google_cloud_project or None,
        "search_mode": settings.parallel_search_mode,
        "processor": settings.parallel_processor,
        "gcs_bucket": settings.gcs_bucket or None,
        "webhooks_enabled": bool(settings.public_base_url),
        "sample_available": SAMPLE_SCRIPT.exists() and SAMPLE_CUT.exists(),
    }


# --------------------------------------------------------------------------
# Projects
# --------------------------------------------------------------------------


def _payload(project: Project) -> dict[str, Any]:
    data = project.model_dump(mode="json")
    data["summary"] = project.summary()
    for raw, item in zip(data.get("items", []), project.items):
        raw["color"] = item.color
        raw["citation_count"] = item.citation_count
        raw["is_resolved"] = item.is_resolved
    return data


async def _probe_duration(path: Path) -> float:
    """Read the container duration with the bundled ffprobe."""
    try:
        import imageio_ffmpeg

        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        process = await asyncio.create_subprocess_exec(
            ffmpeg,
            "-i",
            str(path),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await process.communicate()
        text = stderr.decode("utf-8", "replace")
        marker = text.find("Duration:")
        if marker != -1:
            clock = text[marker + 9 : marker + 21].strip().rstrip(",")
            hours, minutes, seconds = clock.split(":")
            return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    except Exception:  # noqa: BLE001 - a missing duration is not fatal
        logger.warning("Could not probe duration for %s", path.name)
    return 0.0


async def _launch(
    script_asset: Optional[StoredAsset],
    cut_asset: Optional[StoredAsset],
    title: str,
) -> Project:
    duration = 0.0
    if cut_asset is not None:
        async with asset_store.local_path(cut_asset.key) as cut_path:
            duration = await _probe_duration(cut_path)
    return await start_project(script_asset, cut_asset, duration, title=title)


async def _read_upload(upload: UploadFile, label: str) -> bytes:
    data = await upload.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail=f"{label} is too large.")
    return data


@app.post("/api/projects")
async def create_project(
    script: Optional[UploadFile] = File(default=None),
    cut: Optional[UploadFile] = File(default=None),
    title: str = Form(default="Untitled production"),
) -> dict[str, Any]:
    if script is None and cut is None:
        raise HTTPException(status_code=400, detail="Upload a screenplay, a rough cut, or both.")
    if not settings.parallel_configured:
        raise HTTPException(
            status_code=503,
            detail="PARALLEL_API_KEY is not configured. Set it in .env, or set "
            "MOCK_RESEARCH=true to run against fixtures.",
        )

    script_asset: Optional[StoredAsset] = None
    if script is not None:
        script_bytes = await _read_upload(script, "Screenplay")
        script_asset = await asset_store.put_bytes(
            script_bytes,
            script.filename or "screenplay.txt",
            script.content_type or "application/octet-stream",
        )

    cut_asset: Optional[StoredAsset] = None
    if cut is not None:
        try:
            cut_bytes = await _read_upload(cut, "Rough cut")
        except HTTPException:
            if script_asset is not None:
                await asset_store.delete(script_asset.key)
            raise
        cut_asset = await asset_store.put_bytes(
            cut_bytes,
            cut.filename or "rough-cut.mp4",
            cut.content_type or "video/mp4",
        )

    try:
        project = await _launch(script_asset, cut_asset, title)
    except ScreenplayParseError as exc:
        for asset in (script_asset, cut_asset):
            if asset is not None:
                await asset_store.delete(asset.key)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _payload(project)


@app.post("/api/projects/sample")
async def create_sample_project() -> dict[str, Any]:
    if not (SAMPLE_SCRIPT.exists() and SAMPLE_CUT.exists()):
        raise HTTPException(
            status_code=404,
            detail="Sample assets are missing. Run `python tools/generate_demo_assets.py`.",
        )
    script_asset = await asset_store.put_bytes(
        SAMPLE_SCRIPT.read_bytes(), SAMPLE_SCRIPT.name, "text/plain"
    )
    cut_asset = await asset_store.put_bytes(
        SAMPLE_CUT.read_bytes(), SAMPLE_CUT.name, "video/mp4"
    )
    project = await _launch(
        script_asset,
        cut_asset,
        "The Long Way Down",
    )
    return _payload(project)


def _project_state(project: Project) -> str:
    if project.phase == "failed":
        return "Failed"
    if project.phase != "ready":
        return "Processing"
    if any(item.workflow_status.startswith("reopened_by_") for item in project.items):
        return "Reopened"
    if project.items and all(item.is_resolved for item in project.items):
        return "Documented"
    if project.items and all(
        item.is_resolved or item.workflow_status == "coordinator_verified"
        for item in project.items
    ):
        return "Ready for counsel"
    return "Needs review"


@app.get("/api/projects")
async def list_projects(include_archived: bool = False) -> dict[str, Any]:
    projects = await store.list_projects(include_archived=include_archived)
    return {
        "projects": [
            {
                "id": p.id,
                "title": p.title,
                "phase": p.phase,
                "created_at": p.created_at,
                "updated_at": p.updated_at,
                "script_label": p.script.label if p.script else None,
                "cut_label": p.cut.label if p.cut else None,
                "unresolved_count": len(p.items) - sum(1 for item in p.items if item.is_resolved),
                "total_items": len(p.items),
                "state_label": _project_state(p),
                "archived_at": p.archived_at,
            }
            for p in projects
        ]
    }


async def _require(project_id: str) -> Project:
    project = await store.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str) -> dict[str, Any]:
    return _payload(await _require(project_id))


class ProjectArchiveChange(BaseModel):
    archived: bool


@app.patch("/api/projects/{project_id}")
async def update_project(project_id: str, body: ProjectArchiveChange) -> dict[str, Any]:
    project = await _require(project_id)
    now = datetime.now(timezone.utc).isoformat()
    project.archived_at = now if body.archived else None
    project.updated_at = now
    project.log(
        "project_archived" if body.archived else "project_restored",
        actor="coordinator",
        rationale="Project moved out of the active library."
        if body.archived
        else "Project restored to the active library.",
    )
    await store.put(project)
    return _payload(project)


@app.get("/api/projects/{project_id}/packet.md")
async def get_packet(project_id: str) -> PlainTextResponse:
    project = await _require(project_id)
    return PlainTextResponse(
        to_markdown(project),
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="clearance-packet-{project_id}.md"'
        },
    )


@app.get("/api/projects/{project_id}/cut")
async def get_cut(project_id: str, request: Request) -> Response:
    """Serve the rough cut with range support so the player can seek."""
    project = await _require(project_id)
    if project.cut is None or not project.cut.storage_key:
        raise HTTPException(status_code=404, detail="No rough cut for this project.")

    try:
        data = await asset_store.read_bytes(project.cut.storage_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Rough cut asset is missing.") from None

    size = len(data)
    media_type = project.cut.mime_type or "video/mp4"
    range_header = request.headers.get("range")
    if not range_header:
        return Response(
            content=data,
            media_type=media_type,
            headers={"Accept-Ranges": "bytes", "Content-Length": str(size)},
        )

    try:
        units, _, span = range_header.partition("=")
        start_raw, _, end_raw = span.partition("-")
        if units.strip() != "bytes":
            raise ValueError("unsupported range unit")
        start = int(start_raw) if start_raw else 0
        end = int(end_raw) if end_raw else size - 1
    except ValueError:
        raise HTTPException(status_code=416, detail="Malformed Range header.") from None

    start = max(0, start)
    end = min(end, size - 1)
    if start > end:
        raise HTTPException(status_code=416, detail="Range not satisfiable.")
    length = end - start + 1

    return Response(
        content=data[start : end + 1],
        status_code=206,
        media_type=media_type,
        headers={
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(length),
        },
    )


@app.get("/api/projects/{project_id}/stream")
async def stream_project(project_id: str, request: Request) -> StreamingResponse:
    project = await _require(project_id)
    queue = store.subscribe(project_id)

    async def generator():
        try:
            yield f"data: {json.dumps({'type': 'snapshot', 'project': _payload(project)})}\n\n"
            if project.phase in {"ready", "failed"}:
                yield f"data: {json.dumps({'type': 'done', 'phase': project.phase})}\n\n"
                return
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=15.0)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                yield f"data: {json.dumps(payload)}\n\n"
                if payload.get("type") in {"done", "error"}:
                    refreshed = await store.get(project_id)
                    if refreshed is not None:
                        yield f"data: {json.dumps({'type': 'snapshot', 'project': _payload(refreshed)})}\n\n"
                    break
        finally:
            store.unsubscribe(project_id, queue)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# --------------------------------------------------------------------------
# Human review — the guarded surface
# --------------------------------------------------------------------------


class StatusChange(BaseModel):
    status: WorkflowStatus
    actor: Actor = "coordinator"
    actor_name: str = ""
    rationale: str = Field(min_length=1, max_length=1000)


@app.post("/api/projects/{project_id}/items/{item_id}/status")
async def set_item_status(
    project_id: str, item_id: str, body: StatusChange
) -> dict[str, Any]:
    """Move an item's workflow status.

    The `actor` is enforced, not decorative: an `agent` actor is refused any
    human-owned status, and only `counsel` may sign off `counsel_approved`.
    """
    project = await _require(project_id)
    item = project.item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found.")
    try:
        event = item.transition(
            body.status,
            actor=body.actor,
            actor_name=body.actor_name,
            rationale=body.rationale,
        )
    except ApprovalDenied as exc:
        # 403 rather than 400: this is an authorisation boundary, and the demo
        # shows it being enforced.
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    await store.put(project)
    store.publish(
        project_id,
        {
            "type": "item_status",
            "item_id": item_id,
            "status": item.workflow_status,
            "color": item.color,
        },
    )
    return {"item_id": item_id, "status": item.workflow_status, "event": event.model_dump()}


@app.post("/api/projects/{project_id}/items/{item_id}/documents")
async def attach_document(
    project_id: str, item_id: str, document: ProductionDocument = Body(...)
) -> dict[str, Any]:
    project = await _require(project_id)
    item = project.item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found.")

    item.documents.append(document)
    item.log(
        "document_attached",
        actor="coordinator",
        actor_name=document.attached_by,
        rationale=f"Attached {document.kind}: {document.title}",
        detail={"document_id": document.id},
    )
    await store.put(project)
    return {"item_id": item_id, "documents": [d.model_dump() for d in item.documents]}


class DraftRequest(BaseModel):
    tone: str = "professional"


@app.post("/api/projects/{project_id}/items/{item_id}/draft-request")
async def draft_request(project_id: str, item_id: str, body: DraftRequest) -> dict[str, Any]:
    """Prepare an outreach draft. Never sends anything."""
    project = await _require(project_id)
    item = project.item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found.")

    from .agents.drafting import draft_permission_request

    try:
        text = await draft_permission_request(item, project.title, body.tone)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc

    item.draft_request = text
    item.log(
        "draft_prepared",
        actor="agent",
        rationale="Outreach draft prepared for coordinator review. Not sent.",
    )
    await store.put(project)
    return {"item_id": item_id, "draft": text}


# --------------------------------------------------------------------------
# Monitors
# --------------------------------------------------------------------------


class MonitorRequest(BaseModel):
    frequency: str = "1d"


@app.post("/api/projects/{project_id}/items/{item_id}/monitor")
async def create_monitor(project_id: str, item_id: str, body: MonitorRequest) -> dict[str, Any]:
    project = await _require(project_id)
    item = project.item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found.")
    if body.frequency not in {"1h", "1d", "1w"}:
        raise HTTPException(status_code=400, detail="Frequency must be 1h, 1d, or 1w.")

    from .parallel_client import create_item_monitor

    try:
        record = await create_item_monitor(item, project.title, project.id, body.frequency)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc

    await store.put_monitor(record)
    item.monitor_id = record.monitor_id
    item.log(
        "monitor_opened",
        actor="coordinator",
        rationale=f"Watching for public changes every {body.frequency}.",
        detail={"monitor_id": record.monitor_id},
    )
    await store.put(project)
    return record.model_dump(mode="json")


@app.get("/api/projects/{project_id}/monitors")
async def list_monitors(project_id: str) -> dict[str, Any]:
    await _require(project_id)
    records = await store.monitors_for_project(project_id)
    return {"monitors": [r.model_dump(mode="json") for r in records]}


@app.get("/api/monitors/{monitor_id}/events")
async def monitor_events(monitor_id: str) -> dict[str, Any]:
    from .parallel_client import fetch_monitor_events

    record = await store.get_monitor(monitor_id)
    try:
        events = await fetch_monitor_events(monitor_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc

    if record is not None:
        record.events = events
        await store.put_monitor(record)
    return {"monitor_id": monitor_id, "events": events}


@app.post("/api/webhooks/parallel")
async def parallel_webhook(request: Request) -> dict[str, Any]:
    """Receive `monitor.event.detected` and reopen the linked item."""
    if settings.webhook_secret:
        if request.headers.get("x-radar-secret", "") != settings.webhook_secret:
            raise HTTPException(status_code=401, detail="Bad webhook secret.")

    payload = await request.json()
    monitor_id = (payload.get("data") or {}).get("monitor_id")
    if not monitor_id:
        return {"ok": True, "ignored": "no monitor_id"}

    record = await store.get_monitor(monitor_id)
    if record is None:
        return {"ok": True, "ignored": "unknown monitor"}

    from .parallel_client import fetch_monitor_events

    try:
        record.events = await fetch_monitor_events(monitor_id)
        await store.put_monitor(record)
    except Exception:  # noqa: BLE001 - acknowledge anyway so Parallel stops retrying
        logger.exception("Could not pull events for %s", monitor_id)

    project = await store.get(record.project_id)
    if project is not None:
        item = project.item(record.item_id)
        # A public change reopens the item even if a human had already signed
        # it off — that is the whole point of watching. Reopening is not
        # approving, so the agent is permitted to do it.
        if item is not None and item.workflow_status != "reopened_by_monitor":
            item.transition(
                "reopened_by_monitor",
                actor="agent",
                rationale="Parallel Monitor reported a public change affecting this item.",
                detail={"monitor_id": monitor_id},
            )
            await store.put(project)
        store.publish(
            record.project_id,
            {
                "type": "monitor_event",
                "monitor_id": monitor_id,
                "item_id": record.item_id,
                "item_name": record.item_name,
            },
        )
    return {"ok": True}


# --------------------------------------------------------------------------
# Copilot
# --------------------------------------------------------------------------


class ChatRequest(BaseModel):
    question: str
    session_id: Optional[str] = None


@app.post("/api/projects/{project_id}/chat")
async def chat(project_id: str, body: ChatRequest) -> dict[str, Any]:
    project = await _require(project_id)
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Empty question.")

    from .agents import copilot

    session_id = body.session_id or f"chat-{project_id}"
    try:
        answer = await copilot.ask(project, body.question, session_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Copilot failed")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc
    return {"answer": answer, "session_id": session_id}


# --------------------------------------------------------------------------
# Static frontend
# --------------------------------------------------------------------------

if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str) -> FileResponse:
        candidate = STATIC_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
