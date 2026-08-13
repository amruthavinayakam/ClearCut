"""Domain model for Clearance Radar.

The organising idea: a **clearance item** is a question, not an answer. It is
raised by a detection (in the script, in the cut, or both), accumulates cited
evidence, and is only ever *resolved by a human*. The type system enforces that
last part — see `HUMAN_OWNED_STATUSES` and `can_agent_set`.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

# --------------------------------------------------------------------------
# Vocabulary
# --------------------------------------------------------------------------

Category = Literal[
    "brand",
    "artwork",
    "music",
    "real_person",
    "organization",
    "location",
    "quotation",
    "archival",
    "product",
    "signage",
    "other",
]

Provenance = Literal["script_only", "cut_only", "both"]

Confidence = Literal["low", "medium", "high"]

Actor = Literal["agent", "coordinator", "counsel", "system"]

WorkflowStatus = Literal[
    # --- progression ---
    "detected",
    "researching",
    "evidence_ready",
    "coordinator_verified",
    "counsel_approved",
    "documented_permission",
    "approved_replacement",
    # --- alternative states ---
    "unresolved",
    "false_positive",
    "waiting_on_rights_holder",
    "replacement_requested",
    "reopened_by_revision",
    "reopened_by_monitor",
]

#: Statuses that represent a *human judgement*. The agent may never write these.
#: This is the product's central safety property: a model can assemble evidence
#: but cannot decide that something is cleared.
HUMAN_OWNED_STATUSES: frozenset[str] = frozenset(
    {
        "coordinator_verified",
        "counsel_approved",
        "documented_permission",
        "approved_replacement",
        "false_positive",
    }
)

#: Statuses only production counsel may set.
COUNSEL_ONLY_STATUSES: frozenset[str] = frozenset({"counsel_approved"})

HeatColor = Literal["red", "amber", "blue", "green", "gray"]

_STATUS_COLOR: dict[str, HeatColor] = {
    "detected": "red",
    "researching": "red",
    "unresolved": "red",
    "reopened_by_revision": "red",
    "reopened_by_monitor": "red",
    "evidence_ready": "amber",
    "waiting_on_rights_holder": "amber",
    "replacement_requested": "amber",
    "coordinator_verified": "blue",
    "counsel_approved": "green",
    "documented_permission": "green",
    "approved_replacement": "green",
    "false_positive": "gray",
}


def heat_color(status: str) -> HeatColor:
    return _STATUS_COLOR.get(status, "red")


def can_agent_set(status: str) -> bool:
    """Whether the agent is permitted to move an item into `status`."""
    return status not in HUMAN_OWNED_STATUSES


def can_actor_set(actor: Actor, status: str) -> bool:
    if actor == "agent" or actor == "system":
        return can_agent_set(status)
    if status in COUNSEL_ONLY_STATUSES:
        return actor == "counsel"
    return True


class ApprovalDenied(PermissionError):
    """Raised when an actor attempts a transition it does not own."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


# --------------------------------------------------------------------------
# Sources and evidence
# --------------------------------------------------------------------------


class EvidenceSource(BaseModel):
    """A cited public source.

    `retrieved_at` and `via` are not decoration: counsel needs to know when a
    claim was true and which tool established it.
    """

    url: str
    title: Optional[str] = None
    excerpt: str = ""
    publish_date: Optional[str] = None
    retrieved_at: str = Field(default_factory=_now)
    via: Literal["parallel_search", "parallel_task", "parallel_monitor", "document"] = (
        "parallel_search"
    )
    field: Optional[str] = Field(
        default=None, description="Which dossier field this source supports."
    )


class CandidateRightsHolder(BaseModel):
    name: str
    role: str = Field(default="", description="e.g. publisher, label, estate, registrant.")
    rights_implicated: list[str] = Field(default_factory=list)
    share: str = ""
    confidence: Confidence = "low"
    basis: str = Field(default="", description="Why this candidate, in one line.")


class LicensingRoute(BaseModel):
    organization: str = ""
    route: str = Field(default="", description="How a coordinator actually approaches them.")
    contact: str = ""
    url: str = ""


# --------------------------------------------------------------------------
# Detections
# --------------------------------------------------------------------------


class Timecode(BaseModel):
    start: float = Field(description="Seconds from the start of the cut.")
    end: float

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)

    def label(self) -> str:
        def fmt(value: float) -> str:
            minutes, seconds = divmod(value, 60)
            return f"{int(minutes):02d}:{seconds:06.3f}"

        return f"{fmt(self.start)} – {fmt(self.end)}"


class ScriptReference(BaseModel):
    scene_index: int
    scene_heading: str = ""
    page: Optional[int] = None
    excerpt: str = ""
    usage_note: str = ""


class CutDetection(BaseModel):
    timecode: Timecode
    representative_time: float = Field(
        description="Best single frame time for a thumbnail, in seconds."
    )
    modality: Literal["visual", "audio", "both"] = "visual"
    observation: str = Field(description="What is literally visible or audible.")
    confidence: Confidence = "medium"
    scene_match: Optional[int] = Field(
        default=None, description="Screenplay scene index this shot appears to match."
    )
    expected_from_script: bool = False


# --------------------------------------------------------------------------
# Audit
# --------------------------------------------------------------------------


class AuditEvent(BaseModel):
    id: str = Field(default_factory=lambda: _uid("evt"))
    at: str = Field(default_factory=_now)
    actor: Actor
    actor_name: str = ""
    action: str
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    rationale: str = ""
    source_version: str = ""
    detail: dict[str, Any] = Field(default_factory=dict)


# --------------------------------------------------------------------------
# Clearance item
# --------------------------------------------------------------------------


class ProductionDocument(BaseModel):
    id: str = Field(default_factory=lambda: _uid("doc"))
    kind: Literal["release", "license", "permit", "correspondence", "other"] = "license"
    title: str = ""
    notes: str = ""
    covers_territory: str = ""
    covers_term: str = ""
    covers_media: str = ""
    attached_at: str = Field(default_factory=_now)
    attached_by: str = ""


class ClearanceItem(BaseModel):
    id: str = Field(default_factory=lambda: _uid("item"))
    name: str
    category: Category
    description: str = ""

    # --- provenance ---
    provenance: Provenance = "script_only"
    source_version: str = ""
    script_references: list[ScriptReference] = Field(default_factory=list)
    cut_detections: list[CutDetection] = Field(default_factory=list)

    detection_confidence: Confidence = "medium"
    research_priority: Literal["low", "medium", "high"] = "medium"
    production_impact: str = ""

    # --- workflow ---
    workflow_status: WorkflowStatus = "detected"

    # --- research output ---
    candidate_rights_holders: list[CandidateRightsHolder] = Field(default_factory=list)
    licensing_routes: list[LicensingRoute] = Field(default_factory=list)
    sources: list[EvidenceSource] = Field(default_factory=list)
    evidence_gaps: list[str] = Field(default_factory=list)
    unresolved_questions: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    research_summary: str = ""
    research_error: Optional[str] = None
    task_run_id: Optional[str] = None

    # --- coordination ---
    documents: list[ProductionDocument] = Field(default_factory=list)
    monitor_id: Optional[str] = None
    assigned_to: str = ""
    draft_request: Optional[str] = None

    audit_events: list[AuditEvent] = Field(default_factory=list)

    # -- derived ------------------------------------------------------------

    @property
    def color(self) -> HeatColor:
        return heat_color(self.workflow_status)

    @property
    def is_resolved(self) -> bool:
        return self.workflow_status in {
            "counsel_approved",
            "documented_permission",
            "approved_replacement",
            "false_positive",
        }

    @property
    def citation_count(self) -> int:
        return len({s.url for s in self.sources})

    @property
    def has_human_decision(self) -> bool:
        """Whether a person has already acted on this item.

        Refusing the agent human-owned *statuses* is not enough on its own: a
        long-running research task that finishes after a coordinator has
        reviewed an item would otherwise overwrite their decision with
        `evidence_ready`. Losing a human judgement is as bad as forging one, so
        background work checks this before touching status.
        """
        return any(event.actor in ("coordinator", "counsel") for event in self.audit_events)

    def timecodes(self) -> list[Timecode]:
        return [d.timecode for d in self.cut_detections]

    # -- transitions --------------------------------------------------------

    def transition(
        self,
        to_status: WorkflowStatus,
        *,
        actor: Actor,
        actor_name: str = "",
        rationale: str = "",
        source_version: str = "",
        detail: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        """Move this item to `to_status`, recording an audit event.

        Raises `ApprovalDenied` if the actor does not own the target status.
        The agent calls this like everyone else, which is precisely the point:
        there is no separate privileged path for it.
        """
        if not can_actor_set(actor, to_status):
            raise ApprovalDenied(
                f"{actor} may not set status '{to_status}'. "
                "Human-owned approval states require a coordinator or counsel."
            )

        event = AuditEvent(
            actor=actor,
            actor_name=actor_name,
            action="status_change",
            from_status=self.workflow_status,
            to_status=to_status,
            rationale=rationale,
            source_version=source_version or self.source_version,
            detail=detail or {},
        )
        self.workflow_status = to_status
        self.audit_events.append(event)
        return event

    def log(
        self,
        action: str,
        *,
        actor: Actor,
        actor_name: str = "",
        rationale: str = "",
        detail: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        event = AuditEvent(
            actor=actor,
            actor_name=actor_name,
            action=action,
            rationale=rationale,
            source_version=self.source_version,
            detail=detail or {},
        )
        self.audit_events.append(event)
        return event


# --------------------------------------------------------------------------
# Reconciliation
# --------------------------------------------------------------------------

ReconciliationKind = Literal[
    "in_both",
    "script_only",
    "cut_only",
    "materially_changed",
    "approval_stale",
]


class ReconciliationFinding(BaseModel):
    kind: ReconciliationKind
    item_id: str
    item_name: str
    explanation: str = ""

    @property
    def is_alarming(self) -> bool:
        # An unscripted element in the cut is the whole reason this product
        # exists — nobody planned for it, so nobody researched it.
        return self.kind in {"cut_only", "materially_changed", "approval_stale"}


# --------------------------------------------------------------------------
# Versions and project
# --------------------------------------------------------------------------


class ScriptVersion(BaseModel):
    id: str = Field(default_factory=lambda: _uid("script"))
    label: str = "script-v1"
    filename: str = ""
    title: str = ""
    page_count: int = 0
    scene_count: int = 0
    storage_key: str = ""
    mime_type: str = "application/octet-stream"
    size_bytes: int = 0
    uploaded_at: str = Field(default_factory=_now)


class CutVersion(BaseModel):
    id: str = Field(default_factory=lambda: _uid("cut"))
    label: str = "rough-cut-v1"
    filename: str = ""
    duration_s: float = 0.0
    storage_key: str = ""
    mime_type: str = "video/mp4"
    size_bytes: int = 0
    gcs_uri: Optional[str] = None
    media_url: str = ""
    uploaded_at: str = Field(default_factory=_now)


ProjectPhase = Literal[
    "created",
    "scanning_script",
    "scanning_cut",
    "reconciling",
    "researching",
    "ready",
    "failed",
]


class Project(BaseModel):
    id: str = Field(default_factory=lambda: _uid("proj"))
    title: str = "Untitled production"
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)
    phase: ProjectPhase = "created"
    error: Optional[str] = None

    script: Optional[ScriptVersion] = None
    cut: Optional[CutVersion] = None
    script_history: list[ScriptVersion] = Field(default_factory=list)
    cut_history: list[CutVersion] = Field(default_factory=list)

    items: list[ClearanceItem] = Field(default_factory=list)
    reconciliation: list[ReconciliationFinding] = Field(default_factory=list)
    audit_events: list[AuditEvent] = Field(default_factory=list)

    def item(self, item_id: str) -> Optional[ClearanceItem]:
        return next((i for i in self.items if i.id == item_id), None)

    def log(
        self,
        action: str,
        *,
        actor: Actor,
        actor_name: str = "",
        rationale: str = "",
        detail: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        event = AuditEvent(
            actor=actor,
            actor_name=actor_name,
            action=action,
            rationale=rationale,
            source_version=(self.cut.label if self.cut else "") or (
                self.script.label if self.script else ""
            ),
            detail=detail or {},
        )
        self.audit_events.append(event)
        return event

    def summary(self) -> dict[str, Any]:
        colors: dict[str, int] = {"red": 0, "amber": 0, "blue": 0, "green": 0, "gray": 0}
        by_category: dict[str, int] = {}
        for item in self.items:
            colors[item.color] += 1
            by_category[item.category] = by_category.get(item.category, 0) + 1

        unscripted = sum(1 for i in self.items if i.provenance == "cut_only")
        return {
            "colors": colors,
            "by_category": by_category,
            "total_items": len(self.items),
            "unscripted_items": unscripted,
            "resolved_items": sum(1 for i in self.items if i.is_resolved),
            "total_citations": len({s.url for i in self.items for s in i.sources}),
            "reconciliation": {
                kind: sum(1 for f in self.reconciliation if f.kind == kind)
                for kind in ("in_both", "script_only", "cut_only", "materially_changed", "approval_stale")
            },
            # Stated as a headline number because it is the product's core claim.
            "ai_issued_approvals": 0,
        }


# --------------------------------------------------------------------------
# Monitors
# --------------------------------------------------------------------------


class MonitorRecord(BaseModel):
    monitor_id: str
    project_id: str
    item_id: str
    item_name: str
    query: str
    frequency: str
    created_at: str = Field(default_factory=_now)
    status: str = "active"
    events: list[dict[str, Any]] = Field(default_factory=list)
