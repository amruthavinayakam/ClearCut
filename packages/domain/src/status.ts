import type {
  Actor,
  AuditEvent,
  ClearanceItem,
  HeatColor,
  WorkflowStatus,
} from "@clearcut/contracts";

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const HUMAN_OWNED_STATUSES = new Set<WorkflowStatus>([
  "coordinator_verified",
  "counsel_approved",
  "documented_permission",
  "approved_replacement",
  "false_positive",
]);

const RESOLVED_STATUSES = new Set<WorkflowStatus>([
  "counsel_approved",
  "documented_permission",
  "approved_replacement",
  "false_positive",
]);

const STATUS_COLOR: Record<WorkflowStatus, HeatColor> = {
  detected: "red",
  researching: "red",
  evidence_ready: "amber",
  coordinator_verified: "blue",
  counsel_approved: "green",
  documented_permission: "green",
  approved_replacement: "green",
  unresolved: "red",
  false_positive: "gray",
  waiting_on_rights_holder: "amber",
  replacement_requested: "amber",
  reopened_by_revision: "red",
  reopened_by_monitor: "red",
};

export type DispositionChange = {
  actor: Actor;
  actor_name?: string;
  status: WorkflowStatus;
  rationale: string;
  source_version?: string;
  document_ids?: string[];
  detail?: Record<string, unknown>;
};

export function canActorSet(actor: Actor, status: WorkflowStatus): boolean {
  if ((actor === "agent" || actor === "system") && HUMAN_OWNED_STATUSES.has(status)) {
    return false;
  }
  if (status === "counsel_approved") return actor === "counsel";
  return true;
}

export function hasHumanDecision(item: ClearanceItem): boolean {
  return item.audit_events.some((event) => event.actor === "coordinator" || event.actor === "counsel");
}

export function heatColor(status: WorkflowStatus): HeatColor {
  return STATUS_COLOR[status] ?? "red";
}

export function applyDisposition(item: ClearanceItem, change: DispositionChange): ClearanceItem {
  const result = structuredClone(item);
  if ((change.actor === "agent" || change.actor === "system") && hasHumanDecision(result)) {
    return result;
  }
  if (!canActorSet(change.actor, change.status)) {
    throw new DomainError(
      "human_owned_status",
      "Agent and system actors cannot record a human disposition.",
    );
  }
  if ((change.actor === "coordinator" || change.actor === "counsel") && !change.rationale.trim()) {
    throw new DomainError("rationale_required", "Record a rationale for this human disposition.");
  }
  if (change.status === "documented_permission") {
    const owned = new Set(result.documents.map((document) => document.id));
    const selected = change.document_ids ?? [];
    if (selected.length === 0 || selected.some((id) => !owned.has(id))) {
      throw new DomainError(
        "supporting_document_required",
        "Select a supporting document attached to this case.",
      );
    }
  }

  const event: AuditEvent = {
    id: `evt_${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    actor: change.actor,
    actor_name: change.actor_name ?? "",
    action: "status_change",
    from_status: result.workflow_status,
    to_status: change.status,
    rationale: change.rationale,
    source_version: change.source_version ?? result.source_version,
    detail: {
      ...(change.detail ?? {}),
      ...(change.document_ids?.length ? { document_ids: change.document_ids } : {}),
    },
  };
  result.workflow_status = change.status;
  result.color = heatColor(change.status);
  result.is_resolved = RESOLVED_STATUSES.has(change.status);
  result.audit_events.push(event);
  return result;
}
