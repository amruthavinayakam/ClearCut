from __future__ import annotations

import pytest

from backend.app.models import Project
from backend.app.store import ProjectStore


class FakeSnapshot:
    def __init__(self, project: Project) -> None:
        self._data = project.model_dump(mode="json")

    def to_dict(self):
        return self._data


class FakeQuery:
    def __init__(self, projects: list[Project]) -> None:
        self.projects = projects
        self.ordered_by: str | None = None
        self.requested_limit: int | None = None

    def order_by(self, field: str, direction=None):
        self.ordered_by = field
        return self

    def limit(self, value: int):
        self.requested_limit = value
        return self

    async def get(self):
        return [FakeSnapshot(project) for project in self.projects]


class FakeFirestore:
    def __init__(self, projects: list[Project]) -> None:
        self.query = FakeQuery(projects)

    def collection(self, _name: str) -> FakeQuery:
        return self.query


@pytest.mark.asyncio
async def test_firestore_project_listing_reads_beyond_the_process_cache() -> None:
    remote = Project(title="Persisted production", updated_at="2026-08-13T02:00:00Z")
    project_store = ProjectStore()
    fake = FakeFirestore([remote])
    project_store._firestore = fake
    project_store._projects.clear()

    projects = await project_store.list_projects(limit=25)

    assert [project.id for project in projects] == [remote.id]
    assert fake.query.ordered_by == "updated_at"
    assert fake.query.requested_limit is not None
