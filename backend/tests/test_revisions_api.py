from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models import ClearanceItem, Project
from backend.app.revisions import build_candidate_revision, ensure_initial_revision
from backend.app.store import store


client = TestClient(app)


def _project() -> Project:
    project = Project(title="Night Drive", items=[ClearanceItem(name="Northstar Cola", category="brand")])
    ensure_initial_revision(project)
    asyncio.run(store.put(project))
    return project


def test_revision_list_get_and_idempotent_apply() -> None:
    project = _project()
    candidate = build_candidate_revision(
        project,
        [ClearanceItem(name="Northstar Cola", category="brand")],
    )
    project.revisions.append(candidate)
    asyncio.run(store.put(project))

    listed = client.get(f"/api/projects/{project.id}/revisions")
    detail = client.get(f"/api/projects/{project.id}/revisions/{candidate.id}")
    first = client.post(
        f"/api/projects/{project.id}/revisions/{candidate.id}/apply",
        json={"predecessor_id": candidate.predecessor_id},
    )
    second = client.post(
        f"/api/projects/{project.id}/revisions/{candidate.id}/apply",
        json={"predecessor_id": candidate.predecessor_id},
    )

    assert listed.status_code == 200
    assert len(listed.json()["revisions"]) == 2
    assert detail.json()["id"] == candidate.id
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["already_applied"] is True


def test_apply_rejects_an_unexpected_predecessor_without_mutating_active_items() -> None:
    project = _project()
    candidate = build_candidate_revision(
        project,
        [ClearanceItem(name="A new poster", category="artwork")],
    )
    project.revisions.append(candidate)
    asyncio.run(store.put(project))
    before = [item.model_dump(mode="json") for item in project.items]

    response = client.post(
        f"/api/projects/{project.id}/revisions/{candidate.id}/apply",
        json={"predecessor_id": "revision_from_another_tab"},
    )

    assert response.status_code == 409
    refreshed = asyncio.run(store.get(project.id))
    assert refreshed is not None
    assert [item.model_dump(mode="json") for item in refreshed.items] == before


def test_revision_create_requires_a_changed_asset() -> None:
    project = _project()

    response = client.post(f"/api/projects/{project.id}/revisions")

    assert response.status_code == 400
