"""Project and monitor persistence.

In-memory by default so the repo runs with no cloud setup. Set USE_FIRESTORE
and projects survive a Cloud Run instance being recycled — which matters here,
because the audit trail is the product.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from .config import get_settings
from .models import MonitorRecord, Project

logger = logging.getLogger(__name__)


class ProjectStore:
    def __init__(self) -> None:
        self._projects: dict[str, Project] = {}
        self._monitors: dict[str, MonitorRecord] = {}
        self._lock = asyncio.Lock()
        self._subscribers: dict[str, list[asyncio.Queue]] = {}
        self._firestore = None

        settings = get_settings()
        if settings.use_firestore:
            try:
                from google.cloud import firestore

                self._firestore = firestore.AsyncClient(
                    project=settings.google_cloud_project or None
                )
                logger.info("Firestore persistence enabled")
            except Exception:  # noqa: BLE001 - degrade to memory rather than fail boot
                logger.exception("Firestore unavailable; using in-memory store")

    # -- projects -----------------------------------------------------------

    async def put(self, project: Project) -> None:
        async with self._lock:
            self._projects[project.id] = project
        if self._firestore is None:
            return
        settings = get_settings()
        try:
            await self._firestore.collection(settings.firestore_collection).document(
                project.id
            ).set(project.model_dump(mode="json"))
        except Exception:  # noqa: BLE001
            logger.exception("Firestore write failed for %s", project.id)

    async def get(self, project_id: str) -> Optional[Project]:
        async with self._lock:
            project = self._projects.get(project_id)
        if project is not None or self._firestore is None:
            return project

        settings = get_settings()
        try:
            snapshot = await self._firestore.collection(
                settings.firestore_collection
            ).document(project_id).get()
        except Exception:  # noqa: BLE001
            logger.exception("Firestore read failed for %s", project_id)
            return None
        if not snapshot.exists:
            return None
        project = Project.model_validate(snapshot.to_dict())
        async with self._lock:
            self._projects[project_id] = project
        return project

    async def list_projects(self, limit: int = 25) -> list[Project]:
        async with self._lock:
            projects = list(self._projects.values())
        projects.sort(key=lambda p: p.created_at, reverse=True)
        return projects[:limit]

    # -- monitors -----------------------------------------------------------

    async def put_monitor(self, record: MonitorRecord) -> None:
        async with self._lock:
            self._monitors[record.monitor_id] = record

    async def get_monitor(self, monitor_id: str) -> Optional[MonitorRecord]:
        async with self._lock:
            return self._monitors.get(monitor_id)

    async def monitors_for_project(self, project_id: str) -> list[MonitorRecord]:
        async with self._lock:
            return [m for m in self._monitors.values() if m.project_id == project_id]

    # -- progress fan-out ---------------------------------------------------

    def subscribe(self, project_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=512)
        self._subscribers.setdefault(project_id, []).append(queue)
        return queue

    def unsubscribe(self, project_id: str, queue: asyncio.Queue) -> None:
        subscribers = self._subscribers.get(project_id)
        if not subscribers:
            return
        if queue in subscribers:
            subscribers.remove(queue)
        if not subscribers:
            self._subscribers.pop(project_id, None)

    def publish(self, project_id: str, payload: dict) -> None:
        """Push a frame to every open stream. Never blocks the pipeline."""
        for queue in list(self._subscribers.get(project_id, [])):
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                logger.debug("Dropping frame for slow subscriber on %s", project_id)


store = ProjectStore()
