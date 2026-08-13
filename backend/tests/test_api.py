from __future__ import annotations

import asyncio
import uuid

import pytest
from fastapi.testclient import TestClient

import backend.app.main as main_module
from backend.app.assets import FilesystemAssetStore
from backend.app.main import app
from backend.app.models import ActivityEvent, ClearanceItem, CutVersion, Project
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


def test_cut_streaming_uses_persisted_asset_metadata(
    client: TestClient, tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    asset_store = FilesystemAssetStore(tmp_path)
    asset = asyncio.run(
        asset_store.put_bytes(b"0123456789", "rough-cut.mp4", "video/mp4")
    )
    project = Project(
        title="Restart-safe cut",
        cut=CutVersion(
            filename=asset.original_name,
            storage_key=asset.key,
            mime_type=asset.mime_type,
            media_url="/api/projects/proj_restart/cut",
        ),
    )
    asyncio.run(store.put(project))
    monkeypatch.setattr(main_module, "asset_store", asset_store, raising=False)

    persisted = client.get(f"/api/projects/{project.id}")
    response = client.get(
        f"/api/projects/{project.id}/cut", headers={"Range": "bytes=2-5"}
    )

    assert persisted.json()["cut"]["storage_key"] == asset.key
    assert response.status_code == 206
    assert response.content == b"2345"
    assert response.headers["content-range"] == "bytes 2-5/10"
    assert not hasattr(main_module, "_CUT_PATHS")


def test_archive_is_reversible_and_excluded_from_the_active_library(
    client: TestClient,
) -> None:
    project = Project(title=f"Archive test {uuid.uuid4().hex[:6]}")
    asyncio.run(store.put(project))

    archived = client.patch(f"/api/projects/{project.id}", json={"archived": True})
    active_ids = {row["id"] for row in client.get("/api/projects").json()["projects"]}
    archived_ids = {
        row["id"]
        for row in client.get("/api/projects?include_archived=true").json()["projects"]
    }
    restored = client.patch(f"/api/projects/{project.id}", json={"archived": False})

    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None
    assert project.id not in active_ids
    assert project.id in archived_ids
    assert restored.status_code == 200
    assert restored.json()["archived_at"] is None
    refreshed = client.get(f"/api/projects/{project.id}").json()
    assert [event["action"] for event in refreshed["audit_events"]][-2:] == [
        "project_archived",
        "project_restored",
    ]


def test_screenplay_preflight_reports_readable_text(client: TestClient) -> None:
    screenplay = b"Title: Night Drive\n\nINT. CAR - NIGHT\nA radio plays under the dialogue."

    response = client.post(
        "/api/uploads/preflight",
        files={"file": ("film.fountain", screenplay, "text/plain")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["kind"] == "screenplay"
    assert payload["accepted"] is True
    assert payload["details"]["scene_count"] >= 1
    assert payload["details"]["readable_text"] is True


def test_preflight_returns_explicit_error_codes(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    unsupported = client.post(
        "/api/uploads/preflight",
        files={"file": ("rights.exe", b"binary", "application/octet-stream")},
    )
    unreadable = client.post(
        "/api/uploads/preflight",
        files={"file": ("broken.pdf", b"%PDF-not-a-container", "application/pdf")},
    )
    no_text = client.post(
        "/api/uploads/preflight",
        files={"file": ("empty.txt", b"  \n", "text/plain")},
    )
    monkeypatch.setattr(main_module.settings, "max_upload_bytes", 4)
    too_large = client.post(
        "/api/uploads/preflight",
        files={"file": ("long.txt", b"12345", "text/plain")},
    )

    assert unsupported.status_code == 200
    assert unsupported.json()["errors"][0]["code"] == "unsupported_type"
    assert unreadable.status_code == 200
    assert unreadable.json()["errors"][0]["code"] == "unreadable_container"
    assert no_text.json()["errors"][0]["code"] == "no_text_layer"
    assert too_large.json()["errors"][0]["code"] == "too_large"


def test_project_creation_reuses_preflight_type_rules(client: TestClient) -> None:
    response = client.post(
        "/api/projects",
        files={"script": ("malware.exe", b"not a screenplay", "application/octet-stream")},
        data={"title": "Unsafe intake"},
    )

    assert response.status_code == 400
    assert "unsupported_type" in response.json()["detail"]


def test_persisted_activity_survives_a_fresh_project_get(client: TestClient) -> None:
    project = Project(
        title="Persistent activity",
        activity_events=[
            ActivityEvent(
                phase="scanning_cut",
                message="Detected two cut elements.",
                detail={"count": 2},
            )
        ],
    )
    asyncio.run(store.put(project))

    response = client.get(f"/api/projects/{project.id}")

    assert response.status_code == 200
    assert response.json()["activity_events"][0]["message"] == "Detected two cut elements."


def test_research_retry_refuses_duplicate_inflight_work(
    client: TestClient, project_with_item: tuple[str, str]
) -> None:
    project_id, item_id = project_with_item
    project = asyncio.run(store.get(project_id))
    assert project is not None
    project.item(item_id).workflow_status = "researching"  # type: ignore[union-attr]
    asyncio.run(store.put(project))

    response = client.post(f"/api/projects/{project_id}/items/{item_id}/research")

    assert response.status_code == 409
