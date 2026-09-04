from __future__ import annotations

import pytest

from backend.app.models import ClearanceItem, CutDetection, Project, ScriptReference, Timecode
from backend.app.revisions import (
    RevisionComparisonError,
    build_candidate_revision,
    compare_revisions,
    ensure_initial_revision,
)


def _item(name: str, category: str, *, scene: int | None = None, at: float | None = None) -> ClearanceItem:
    item = ClearanceItem(name=name, category=category)
    if scene is not None:
        item.script_references.append(ScriptReference(scene_index=scene, scene_heading="INT. ROOM"))
    if at is not None:
        item.cut_detections.append(
            CutDetection(
                timecode=Timecode(start=at, end=at + 4),
                representative_time=at + 1,
                observation=name,
            )
        )
    return item


def test_compare_revisions_reports_all_five_outcomes() -> None:
    brand = _item("Northstar Cola", "brand", at=5)
    sign = _item("Velvet Room sign", "signage", at=18)
    artwork = _item("A framed painting", "artwork", scene=3)
    music = _item("Midnight Orchard", "music", at=10)
    music.transition("documented_permission", actor="coordinator", rationale="Licence recorded.")
    previous = Project(title="Night Drive", items=[brand, sign, artwork, music])
    ensure_initial_revision(previous)

    candidate_brand = _item("Northstar Cola", "brand", at=5)
    candidate_poster = _item("Harbor Festival poster", "artwork", at=42)
    candidate_artwork = _item("Harbor Lights, 1961", "artwork", scene=3)
    candidate_music = _item("Midnight Orchard", "music", at=30)

    changes = compare_revisions(
        previous.revisions[0],
        [candidate_brand, candidate_poster, candidate_artwork, candidate_music],
    )

    by_name = {change.item_name: change for change in changes}
    assert by_name["Northstar Cola"].kind == "unchanged"
    assert by_name["Harbor Festival poster"].kind == "added"
    assert by_name["Velvet Room sign"].kind == "removed"
    assert by_name["Harbor Lights, 1961"].kind == "materially_changed"
    assert by_name["Midnight Orchard"].kind == "decision_stale"
    assert by_name["Northstar Cola"].before_item_id == brand.id
    assert by_name["Northstar Cola"].after_item_id == candidate_brand.id


def test_unchanged_item_retains_human_record_and_evidence() -> None:
    previous_item = _item("Northstar Cola", "brand", at=5)
    previous_item.research_summary = "Public evidence assembled."
    previous_item.transition("coordinator_verified", actor="coordinator", rationale="Reviewed.")
    project = Project(items=[previous_item])
    ensure_initial_revision(project)

    revision = build_candidate_revision(project, [_item("Northstar Cola", "brand", at=5)])

    retained = revision.items[0]
    assert retained.stable_item_id == previous_item.stable_item_id
    assert retained.workflow_status == "coordinator_verified"
    assert retained.research_summary == "Public evidence assembled."


def test_failed_comparison_does_not_mutate_active_project() -> None:
    project = Project(items=[_item("Northstar Cola", "brand", at=5)])
    ensure_initial_revision(project)
    before = project.model_dump(mode="json")

    with pytest.raises(RevisionComparisonError):
        build_candidate_revision(project, [None])  # type: ignore[list-item]

    assert project.model_dump(mode="json") == before
