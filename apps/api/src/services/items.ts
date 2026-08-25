import type { AuditEvent, ClearanceItem, Project } from "@clearcut/contracts";

import { ApiProblem } from "../middleware/errors";

export function requireItem(project: Project, itemId: string): ClearanceItem {
  const item = project.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new ApiProblem(404, "item_not_found", "Clearance item not found.");
  return item;
}

export function audit(input: {
  actor: AuditEvent["actor"];
  action: string;
  rationale: string;
  actorName?: string;
  sourceVersion?: string;
  detail?: Record<string, unknown>;
}): AuditEvent {
  return {
    id: `evt_${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    actor: input.actor,
    actor_name: input.actorName ?? "",
    action: input.action,
    from_status: null,
    to_status: null,
    rationale: input.rationale,
    source_version: input.sourceVersion ?? "",
    detail: input.detail ?? {},
  };
}
