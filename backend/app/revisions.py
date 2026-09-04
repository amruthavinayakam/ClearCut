"""Immutable candidate revisions and deterministic clearance-state comparison."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Iterable

from .models import (
    ClearanceItem,
    CutVersion,
    Project,
    ProjectRevision,
    RevisionChange,
    ScriptVersion,
)


class RevisionComparisonError(ValueError):
    """Raised when a candidate cannot be compared without unsafe assumptions."""


class RevisionConflictError(RuntimeError):
    """Raised when a candidate no longer follows the active revision."""


def _normal(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def _scenes(item: ClearanceItem) -> set[int]:
    return {reference.scene_index for reference in item.script_references}


def _times(item: ClearanceItem) -> list[tuple[float, float]]:
    return [
        (round(detection.timecode.start, 1), round(detection.timecode.end, 1))
        for detection in item.cut_detections
    ]


def _source_proximity(before: ClearanceItem, after: ClearanceItem) -> bool:
    before_scenes = _scenes(before)
    after_scenes = _scenes(after)
    if before_scenes and after_scenes and before_scenes & after_scenes:
        return True
    before_times = _times(before)
    after_times = _times(after)
    return any(
        abs(old_start - new_start) <= 8
        for old_start, _ in before_times
        for new_start, _ in after_times
    )


def _anchors_changed(before: ClearanceItem, after: ClearanceItem) -> bool:
    if _scenes(before) or _scenes(after):
        if _scenes(before) != _scenes(after):
            return True
    if _times(before) or _times(after):
        if _times(before) != _times(after):
            return True
    return before.provenance != after.provenance


def _active_revision(project: Project) -> ProjectRevision:
    if project.active_revision_id:
        active = next(
            (revision for revision in project.revisions if revision.id == project.active_revision_id),
            None,
        )
        if active is not None:
            return active
    if project.revisions:
        return project.revisions[-1]
    raise RevisionComparisonError("The project has no active revision snapshot.")


def ensure_initial_revision(project: Project) -> ProjectRevision:
    """Snapshot the first completed project exactly once."""
    if project.revisions:
        if not project.active_revision_id:
            project.active_revision_id = project.revisions[-1].id
        return _active_revision(project)
    revision = ProjectRevision(
        sequence=1,
        script=project.script.model_copy(deep=True) if project.script else None,
        cut=project.cut.model_copy(deep=True) if project.cut else None,
        state="applied",
        items=[item.model_copy(deep=True) for item in project.items],
        changes=[],
        applied_at=datetime.now(timezone.utc).isoformat(),
    )
    project.revisions.append(revision)
    project.active_revision_id = revision.id
    return revision


def _find_matches(
    previous_items: list[ClearanceItem],
    candidate_items: list[ClearanceItem],
) -> tuple[dict[str, tuple[ClearanceItem, str]], set[str]]:
    unmatched = {item.id: item for item in previous_items}
    by_stable = {item.stable_item_id: item for item in previous_items}
    matches: dict[str, tuple[ClearanceItem, str]] = {}

    for candidate in candidate_items:
        explicit = by_stable.get(candidate.stable_item_id)
        if explicit and explicit.id in unmatched:
            matches[candidate.id] = (explicit, "explicit stable identity")
            unmatched.pop(explicit.id)

    for candidate in candidate_items:
        if candidate.id in matches:
            continue
        exact = next(
            (
                item
                for item in unmatched.values()
                if _normal(item.name) == _normal(candidate.name)
                and item.category == candidate.category
            ),
            None,
        )
        if exact:
            matches[candidate.id] = (exact, "normalized category and name")
            unmatched.pop(exact.id)

    for candidate in candidate_items:
        if candidate.id in matches:
            continue
        nearby = [
            item
            for item in unmatched.values()
            if item.category == candidate.category and _source_proximity(item, candidate)
        ]
        if len(nearby) == 1:
            matches[candidate.id] = (nearby[0], "category and source proximity")
            unmatched.pop(nearby[0].id)

    return matches, set(unmatched)


def compare_revisions(
    previous: ProjectRevision,
    candidate_items: Iterable[ClearanceItem],
) -> list[RevisionChange]:
    candidates = list(candidate_items)
    if any(not isinstance(item, ClearanceItem) for item in candidates):
        raise RevisionComparisonError("Every revision candidate must be a clearance item.")
    if len({item.id for item in candidates}) != len(candidates):
        raise RevisionComparisonError("Revision candidate item IDs must be unique.")

    matches, removed_ids = _find_matches(previous.items, candidates)
    changes: list[RevisionChange] = []
    for candidate in candidates:
        match = matches.get(candidate.id)
        if match is None:
            changes.append(
                RevisionChange(
                    kind="added",
                    stable_item_id=candidate.stable_item_id,
                    item_name=candidate.name,
                    after_item_id=candidate.id,
                    explanation="New clearance element in the candidate revision.",
                    match_basis="no safe predecessor match",
                )
            )
            continue
        before, basis = match
        identity_changed = (
            _normal(before.name) != _normal(candidate.name)
            or before.category != candidate.category
        )
        stale = before.has_human_decision and _anchors_changed(before, candidate)
        kind = "decision_stale" if stale else "materially_changed" if identity_changed else "unchanged"
        explanation = {
            "unchanged": "Identity and recorded source anchors are unchanged.",
            "materially_changed": "The element became materially more specific or changed identity.",
            "decision_stale": "A prior human disposition predates changed source anchors or use.",
        }[kind]
        changes.append(
            RevisionChange(
                kind=kind,
                stable_item_id=before.stable_item_id,
                item_name=candidate.name,
                before_item_id=before.id,
                after_item_id=candidate.id,
                explanation=explanation,
                match_basis=basis,
                previous_status=before.workflow_status,
            )
        )
    for item in previous.items:
        if item.id in removed_ids:
            changes.append(
                RevisionChange(
                    kind="removed",
                    stable_item_id=item.stable_item_id,
                    item_name=item.name,
                    before_item_id=item.id,
                    explanation="The element is absent from the candidate revision.",
                    match_basis="no safe candidate match",
                    previous_status=item.workflow_status,
                )
            )
    return changes


def _carry_record(before: ClearanceItem, after: ClearanceItem) -> ClearanceItem:
    retained = before.model_copy(deep=True)
    retained.id = after.id
    retained.stable_item_id = before.stable_item_id
    retained.name = after.name
    retained.category = after.category
    retained.description = after.description
    retained.provenance = after.provenance
    retained.source_version = after.source_version
    retained.script_references = after.script_references
    retained.cut_detections = after.cut_detections
    retained.detection_confidence = after.detection_confidence
    retained.research_priority = after.research_priority
    retained.production_impact = after.production_impact
    return retained


def build_candidate_revision(
    project: Project,
    candidate_items: Iterable[ClearanceItem],
    *,
    script: ScriptVersion | None = None,
    cut: CutVersion | None = None,
    revision_id: str | None = None,
) -> ProjectRevision:
    """Build a detached ready snapshot; never mutates ``project``."""
    candidates = list(candidate_items)
    if any(not isinstance(item, ClearanceItem) for item in candidates):
        raise RevisionComparisonError("Every revision candidate must be a clearance item.")
    previous = _active_revision(project)
    changes = compare_revisions(previous, candidates)
    by_after = {change.after_item_id: change for change in changes if change.after_item_id}
    previous_by_id = {item.id: item for item in previous.items}
    items: list[ClearanceItem] = []
    for candidate in candidates:
        candidate_copy = candidate.model_copy(deep=True)
        change = by_after[candidate.id]
        if change.before_item_id:
            candidate_copy = _carry_record(previous_by_id[change.before_item_id], candidate_copy)
        items.append(candidate_copy)
    values = {
        "sequence": max((revision.sequence for revision in project.revisions), default=0) + 1,
        "script": (script or project.script).model_copy(deep=True) if (script or project.script) else None,
        "cut": (cut or project.cut).model_copy(deep=True) if (cut or project.cut) else None,
        "state": "ready",
        "items": items,
        "changes": changes,
        "predecessor_id": previous.id,
    }
    if revision_id:
        values["id"] = revision_id
    return ProjectRevision(**values)


def apply_revision(
    project: Project,
    revision_id: str,
    predecessor_id: str | None,
) -> tuple[ProjectRevision, bool]:
    revision = next((candidate for candidate in project.revisions if candidate.id == revision_id), None)
    if revision is None:
        raise RevisionComparisonError("Revision not found.")
    if revision.state == "applied" and project.active_revision_id == revision.id:
        return revision, True
    if revision.state != "ready":
        raise RevisionComparisonError("Only a ready comparison can be applied.")
    if predecessor_id != revision.predecessor_id or project.active_revision_id != revision.predecessor_id:
        raise RevisionConflictError("The active revision changed. Refresh and compare again.")

    promoted = [item.model_copy(deep=True) for item in revision.items]
    by_stable = {item.stable_item_id: item for item in promoted}
    for change in revision.changes:
        if change.kind not in {"materially_changed", "decision_stale"}:
            continue
        item = by_stable.get(change.stable_item_id)
        if item is None:
            continue
        item.transition(
            "reopened_by_revision",
            actor="system",
            rationale=change.explanation,
            detail={
                "revision_id": revision.id,
                "previous_status": change.previous_status,
                "before_item_id": change.before_item_id,
                "after_item_id": change.after_item_id,
            },
        )

    project.items = promoted
    project.script = revision.script.model_copy(deep=True) if revision.script else None
    project.cut = revision.cut.model_copy(deep=True) if revision.cut else None
    if project.script and all(version.id != project.script.id for version in project.script_history):
        project.script_history.append(project.script)
    if project.cut and all(version.id != project.cut.id for version in project.cut_history):
        project.cut_history.append(project.cut)
    project.active_revision_id = revision.id
    revision.state = "applied"
    revision.applied_at = datetime.now(timezone.utc).isoformat()
    project.updated_at = revision.applied_at
    project.log(
        "revision_applied",
        actor="coordinator",
        rationale=f"Applied revision {revision.sequence} after reviewing its comparison.",
        detail={
            "revision_id": revision.id,
            "predecessor_id": revision.predecessor_id,
            "reopened": sum(
                change.kind in {"materially_changed", "decision_stale"}
                for change in revision.changes
            ),
        },
    )
    return revision, False
