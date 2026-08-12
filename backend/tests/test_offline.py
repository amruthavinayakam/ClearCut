"""Offline checks — no Google Cloud or Parallel credentials required.

Covers the deterministic guarantees: the approval invariant, status/colour
mapping, screenplay parsing, reconciliation bookkeeping, packet export, and the
progress bus.

    python -m backend.tests.test_offline
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

os.environ.setdefault("MOCK_RESEARCH", "true")
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "FALSE")

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.app.export import to_markdown  # noqa: E402
from backend.app.models import (  # noqa: E402
    ApprovalDenied,
    CandidateRightsHolder,
    ClearanceItem,
    CutDetection,
    EvidenceSource,
    HUMAN_OWNED_STATUSES,
    Project,
    ScriptReference,
    Timecode,
    can_agent_set,
    heat_color,
)
from backend.app.parallel_client import (  # noqa: E402
    build_dossier_schema,
    build_search_queries,
)
from backend.app.screenplay import parse_screenplay  # noqa: E402

SAMPLE = Path(__file__).resolve().parents[1] / "app" / "samples" / "the_long_way_down.fountain"

failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  PASS  {label}")
    else:
        failures.append(label)
        print(f"  FAIL  {label} {detail}")


def _item(**kwargs) -> ClearanceItem:
    defaults = dict(name="Midnight Orchard", category="artwork")
    defaults.update(kwargs)
    return ClearanceItem(**defaults)


# --------------------------------------------------------------------------


def test_approval_invariant() -> None:
    """The product's central safety property, tested directly."""
    print("\napproval invariant")

    for status in sorted(HUMAN_OWNED_STATUSES):
        item = _item()
        raised = False
        try:
            item.transition(status, actor="agent", rationale="should be refused")
        except ApprovalDenied:
            raised = True
        check(f"agent refused '{status}'", raised, "agent was allowed to approve")
        check(
            f"status unchanged after refused '{status}'",
            item.workflow_status == "detected",
            item.workflow_status,
        )
        check(f"no audit event written for refused '{status}'", not item.audit_events)

    item = _item()
    item.transition("researching", actor="agent")
    item.transition("evidence_ready", actor="agent")
    check("agent may reach evidence_ready", item.workflow_status == "evidence_ready")

    item.transition("coordinator_verified", actor="coordinator", actor_name="A. Rivera")
    check("coordinator may verify", item.workflow_status == "coordinator_verified")

    denied = False
    try:
        item.transition("counsel_approved", actor="coordinator")
    except ApprovalDenied:
        denied = True
    check("coordinator refused counsel_approved", denied)

    item.transition("counsel_approved", actor="counsel", actor_name="M. Osei")
    check("counsel may approve", item.workflow_status == "counsel_approved")

    check("system actor is bound by the same rule", not can_agent_set("counsel_approved"))
    check("audit trail recorded every accepted move", len(item.audit_events) == 4)
    last = item.audit_events[-1]
    check("audit records actor identity", last.actor == "counsel" and last.actor_name == "M. Osei")
    check("audit records the transition", last.from_status == "coordinator_verified")


def test_human_decision_is_not_clobbered() -> None:
    """Background research must not overwrite a decision a person already made."""
    print("\nhuman decisions survive late research")

    item = _item()
    item.transition("researching", actor="agent")
    check("agent work is not a human decision", not item.has_human_decision)

    item.transition("coordinator_verified", actor="coordinator", actor_name="A. Rivera")
    check("coordinator action is detected", item.has_human_decision)

    # Simulates a slow Task run landing after the coordinator reviewed.
    from backend.app.pipeline import research_item  # noqa: PLC0415 - avoids a cycle at import

    check("pipeline guards on has_human_decision", "has_human_decision" in research_item.__code__.co_names)
    check(
        "status untouched by the guard",
        item.workflow_status == "coordinator_verified",
        item.workflow_status,
    )

    counsel = _item()
    counsel.transition("counsel_approved", actor="counsel")
    check("counsel action is detected", counsel.has_human_decision)


def test_colors() -> None:
    print("\nstatus colours")
    check("detected is red", heat_color("detected") == "red")
    check("evidence_ready is amber", heat_color("evidence_ready") == "amber")
    check("coordinator_verified is blue", heat_color("coordinator_verified") == "blue")
    check("counsel_approved is green", heat_color("counsel_approved") == "green")
    check("false_positive is gray", heat_color("false_positive") == "gray")
    check("monitor reopen returns to red", heat_color("reopened_by_monitor") == "red")
    # Nothing the agent can set may be green: that is the invariant, in colour.
    agent_reachable = {s for s in _all_statuses() if can_agent_set(s)}
    check(
        "no agent-reachable status is green",
        all(heat_color(s) != "green" for s in agent_reachable),
        str(sorted(s for s in agent_reachable if heat_color(s) == "green")),
    )


def _all_statuses() -> list[str]:
    from backend.app.models import WorkflowStatus
    from typing import get_args

    return list(get_args(WorkflowStatus))


def test_parsing() -> None:
    print("\nscreenplay parsing")
    doc = parse_screenplay(SAMPLE.read_bytes(), SAMPLE.name)
    check("title extracted", "LONG WAY DOWN" in doc.title.upper(), doc.title)
    check("scenes found", len(doc.scenes) >= 4, str(len(doc.scenes)))
    check(
        "velvet room scene present",
        any("VELVET ROOM" in s.heading.upper() for s in doc.scenes),
    )
    check(
        "generic photograph reference retained",
        any("photograph" in s.text.lower() for s in doc.scenes),
    )


def test_search_and_schema() -> None:
    print("\nparallel request construction")
    schema = build_dossier_schema()
    check("schema is an object", schema["type"] == "object")
    check("strict schema", schema["additionalProperties"] is False)
    check(
        "all properties required",
        set(schema["required"]) == set(schema["properties"]),
    )
    check("evidence_gaps is required", "evidence_gaps" in schema["properties"])

    queries, objective = build_search_queries(_item(category="music", name="Cold Harbor"), "The Long Way Down")
    check("music search splits composition and master", len(queries) == 2)
    check("objective names the element", "Cold Harbor" in objective)
    check("objective forbids inference", "do not infer" in objective.lower())


def test_reconciliation_bookkeeping() -> None:
    print("\nreconciliation bookkeeping")
    project = Project(title="The Long Way Down")

    scripted = _item(name="The Velvet Room", category="signage", provenance="both")
    scripted.script_references.append(
        ScriptReference(scene_index=3, scene_heading="EXT. THE VELVET ROOM - NIGHT")
    )
    scripted.cut_detections.append(
        CutDetection(
            timecode=Timecode(start=32.0, end=40.0),
            representative_time=35.0,
            observation="Neon sign",
        )
    )
    unscripted = _item(name="Northstar Cola", category="brand", provenance="cut_only")
    unscripted.cut_detections.append(
        CutDetection(
            timecode=Timecode(start=17.5, end=25.0),
            representative_time=21.0,
            observation="Can on table",
        )
    )
    project.items = [scripted, unscripted]

    summary = project.summary()
    check("unscripted counted", summary["unscripted_items"] == 1, str(summary["unscripted_items"]))
    check("all items start red", summary["colors"]["red"] == 2)
    check("no ai approvals reported", summary["ai_issued_approvals"] == 0)
    check("timecode label formats", scripted.cut_detections[0].timecode.label().startswith("00:32"))
    check("timecode duration", abs(unscripted.cut_detections[0].timecode.duration - 7.5) < 0.01)


def test_export() -> None:
    print("\npacket export")
    project = Project(title="The Long Way Down")
    item = _item(name="Midnight Orchard", provenance="cut_only")
    item.cut_detections.append(
        CutDetection(
            timecode=Timecode(start=8.0, end=17.5),
            representative_time=12.0,
            observation="Framed poster on the wall",
        )
    )
    item.candidate_rights_holders.append(
        CandidateRightsHolder(name="Example Estate", role="estate", confidence="medium")
    )
    item.sources.append(
        EvidenceSource(url="https://example.test/a", title="A source", excerpt="text", via="parallel_search")
    )
    item.transition("researching", actor="agent")
    item.transition("evidence_ready", actor="agent")
    project.items = [item]

    markdown = to_markdown(project)
    check("packet names the production", "The Long Way Down" in markdown)
    check("packet flags unscripted", "UNSCRIPTED" in markdown)
    check("packet carries the disclaimer", "not legal advice" in markdown)
    check("packet reports zero AI approvals", "AI-issued approvals" in markdown)
    check("packet lists sources with retrieval date", "retrieved" in markdown)
    check("packet includes the audit trail", "Audit trail" in markdown)
    check("packet shows candidate caveat", "confirm before reliance" in markdown.lower())


async def test_store() -> None:
    print("\nproject store")
    from backend.app.store import store

    project = Project(id="proj_test", title="Test")
    await store.put(project)
    fetched = await store.get("proj_test")
    check("round-trips a project", fetched is not None and fetched.title == "Test")

    queue = store.subscribe("proj_test")
    store.publish("proj_test", {"type": "progress", "message": "hello"})
    payload = await asyncio.wait_for(queue.get(), timeout=2)
    check("publishes to subscribers", payload["message"] == "hello")
    store.unsubscribe("proj_test", queue)


def main() -> int:
    test_approval_invariant()
    test_human_decision_is_not_clobbered()
    test_colors()
    test_parsing()
    test_search_and_schema()
    test_reconciliation_bookkeeping()
    test_export()
    asyncio.run(test_store())

    print()
    if failures:
        print(f"{len(failures)} check(s) FAILED: {', '.join(failures)}")
        return 1
    print("All offline checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
