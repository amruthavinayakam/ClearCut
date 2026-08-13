from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

import backend.app.main as main_module
from backend.app.assets import FilesystemAssetStore
from backend.app.main import app
from backend.app.models import ClearanceItem, Project
from backend.app.store import store


@pytest.fixture
def client(tmp_path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(main_module, "asset_store", FilesystemAssetStore(tmp_path))
    return TestClient(app)


@pytest.fixture
def two_item_project() -> tuple[Project, ClearanceItem, ClearanceItem]:
    first = ClearanceItem(name="Harbor Lights", category="artwork")
    second = ClearanceItem(name="Midnight Orchard", category="music")
    project = Project(title="Night Drive", items=[first, second])
    asyncio.run(store.put(project))
    return project, first, second


def test_document_upload_download_patch_and_delete(
    client: TestClient, two_item_project
) -> None:
    project, item, _ = two_item_project
    uploaded = client.post(
        f"/api/projects/{project.id}/items/{item.id}/documents",
        files={"file": ("license.pdf", b"permission", "application/pdf")},
        data={
            "kind": "license",
            "title": "Artwork licence",
            "media": "theatrical,streaming",
            "territories": "US,CA",
            "perpetual": "true",
            "attached_by": "Mara Chen",
        },
    )
    document = uploaded.json()["document"]

    downloaded = client.get(
        f"/api/projects/{project.id}/items/{item.id}/documents/{document['id']}"
    )
    patched = client.patch(
        f"/api/projects/{project.id}/items/{item.id}/documents/{document['id']}",
        json={"notes": "Countersigned copy", "territories": ["US"]},
    )
    deleted = client.delete(
        f"/api/projects/{project.id}/items/{item.id}/documents/{document['id']}"
    )

    assert uploaded.status_code == 200
    assert downloaded.content == b"permission"
    assert downloaded.headers["content-type"].startswith("application/pdf")
    assert patched.json()["document"]["notes"] == "Countersigned copy"
    assert deleted.status_code == 204
    assert client.get(
        f"/api/projects/{project.id}/items/{item.id}/documents/{document['id']}"
    ).status_code == 404


def test_document_ownership_is_enforced(client: TestClient, two_item_project) -> None:
    project, first, second = two_item_project
    uploaded = client.post(
        f"/api/projects/{project.id}/items/{first.id}/documents",
        files={"file": ("release.txt", b"release", "text/plain")},
        data={"kind": "release", "title": "Appearance release"},
    ).json()["document"]

    response = client.get(
        f"/api/projects/{project.id}/items/{second.id}/documents/{uploaded['id']}"
    )

    assert response.status_code == 404


def test_documented_permission_requires_an_owned_document(
    client: TestClient, two_item_project
) -> None:
    project, item, other = two_item_project
    other_document = client.post(
        f"/api/projects/{project.id}/items/{other.id}/documents",
        files={"file": ("other.txt", b"other", "text/plain")},
        data={"kind": "license", "title": "Other licence"},
    ).json()["document"]

    missing = client.post(
        f"/api/projects/{project.id}/items/{item.id}/status",
        json={
            "status": "documented_permission",
            "actor": "coordinator",
            "rationale": "Permission is recorded.",
            "document_ids": [],
        },
    )
    wrong = client.post(
        f"/api/projects/{project.id}/items/{item.id}/status",
        json={
            "status": "documented_permission",
            "actor": "coordinator",
            "rationale": "Permission is recorded.",
            "document_ids": [other_document["id"]],
        },
    )

    assert missing.status_code == 422
    assert wrong.status_code == 422
