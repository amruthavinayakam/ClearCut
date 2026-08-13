from __future__ import annotations

import asyncio
import uuid

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models import ClearanceItem, Project
from backend.app.store import store


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def project_with_item() -> tuple[str, str]:
    suffix = uuid.uuid4().hex[:8]
    item = ClearanceItem(id=f"item_{suffix}", name="Midnight Orchard", category="artwork")
    project = Project(id=f"proj_{suffix}", title="The Long Way Down", items=[item])
    asyncio.run(store.put(project))
    return project.id, item.id


def test_unknown_status_is_rejected_without_mutation(
    client: TestClient, project_with_item: tuple[str, str]
) -> None:
    project_id, item_id = project_with_item

    response = client.post(
        f"/api/projects/{project_id}/items/{item_id}/status",
        json={
            "status": "invented_state",
            "actor": "coordinator",
            "rationale": "This state is not part of the clearance workflow.",
        },
    )

    assert response.status_code == 422
    refreshed = client.get(f"/api/projects/{project_id}").json()
    assert refreshed["items"][0]["workflow_status"] == "detected"


def test_unknown_actor_is_rejected_by_request_schema(
    client: TestClient, project_with_item: tuple[str, str]
) -> None:
    project_id, item_id = project_with_item

    response = client.post(
        f"/api/projects/{project_id}/items/{item_id}/status",
        json={
            "status": "coordinator_verified",
            "actor": "producer",
            "rationale": "An undefined role must not own a workflow transition.",
        },
    )

    assert response.status_code == 422


def test_human_transition_requires_a_rationale(
    client: TestClient, project_with_item: tuple[str, str]
) -> None:
    project_id, item_id = project_with_item

    response = client.post(
        f"/api/projects/{project_id}/items/{item_id}/status",
        json={"status": "coordinator_verified", "actor": "coordinator", "rationale": ""},
    )

    assert response.status_code == 422
