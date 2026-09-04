from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models import (
    AuditEvent,
    ClearanceItem,
    ProductionDocument,
    Project,
    ProjectRevision,
)
from backend.app.scope import IntendedUseProfile
from backend.app.store import store


client = TestClient(app)


def _packet_project() -> Project:
    ordinary = ClearanceItem(name="Northstar Cola", category="brand")
    ordinary.sources = []
    reopened = ClearanceItem(
        name="Midnight Orchard",
        category="music",
        workflow_status="reopened_by_revision",
        research_error="Updated use has not been researched.",
        documents=[
            ProductionDocument(
                title="Festival licence",
                kind="license",
                media=["festival"],
                territories=["US"],
                perpetual=True,
            )
        ],
    )
    project = Project(
        title="Night Drive",
        phase="ready",
        items=[ordinary, reopened],
        use_profile=IntendedUseProfile(media=["streaming"], territories=["US"]),
    )
    revision = ProjectRevision(sequence=2, state="applied", items=project.items)
    project.revisions = [revision]
    project.active_revision_id = revision.id
    return project


def test_packet_uses_current_revision_scope_and_reopened_first_ordering() -> None:
    project = _packet_project()
    asyncio.run(store.put(project))

    response = client.get(f"/api/projects/{project.id}/packet.md")
    markdown = response.text

    assert response.status_code == 200
    assert f"Active revision | `2 · {project.active_revision_id}`" in markdown
    assert "INCOMPLETE RESEARCH" in markdown
    assert markdown.index("Midnight Orchard") < markdown.index("Northstar Cola")
    assert "Streaming is not listed in recorded media." in markdown
    assert "Festival licence" in markdown
    refreshed = asyncio.run(store.get(project.id))
    assert refreshed is not None
    assert all(event.action != "packet_exported" for event in refreshed.audit_events)


def test_confirmed_packet_export_records_an_audit_event() -> None:
    project = _packet_project()
    asyncio.run(store.put(project))

    response = client.post(f"/api/projects/{project.id}/packet-exports")

    assert response.status_code == 200
    assert response.headers["content-disposition"].startswith("attachment;")
    assert "Clearance Research Packet" in response.text
    refreshed = asyncio.run(store.get(project.id))
    assert refreshed is not None
    assert refreshed.audit_events[-1].action == "packet_exported"


def test_ai_issued_approvals_is_measured_from_audit_events() -> None:
    project = Project(
        audit_events=[
            AuditEvent(
                actor="agent",
                action="legacy_status_change",
                to_status="documented_permission",
            )
        ]
    )

    assert project.summary()["ai_issued_approvals"] == 1
