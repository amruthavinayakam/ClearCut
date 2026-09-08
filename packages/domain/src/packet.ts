import type { AuditEvent, DocumentScope, Project } from "@clearcut/contracts";

import { assessScope } from "./scope";

const INCOMPLETE_STATUSES = new Set([
  "detected",
  "researching",
  "unresolved",
  "reopened_by_revision",
  "reopened_by_monitor",
]);

export type PacketReadiness = {
  ready: boolean;
  incomplete_item_ids: string[];
  scope_gaps: Array<{ item_id: string; document_id: string; gaps: string[] }>;
};

export function packetReadiness(project: Project): PacketReadiness {
  const incompleteItemIds = project.items
    .filter((item) => INCOMPLETE_STATUSES.has(item.workflow_status) || Boolean(item.research_error))
    .map((item) => item.id);
  const scopeGaps = project.items.flatMap((item) => item.documents.flatMap((document) => {
    const scope: DocumentScope = {
      media: document.media,
      territories: document.territories,
      starts_on: document.starts_on,
      ends_on: document.ends_on,
      perpetual: document.perpetual,
      covered_use: document.covered_use,
    };
    const assessment = assessScope(project.use_profile, scope);
    return assessment.gaps.length ? [{
      item_id: item.id,
      document_id: document.id,
      gaps: assessment.gaps,
    }] : [];
  }));
  return {
    ready: incompleteItemIds.length === 0 && scopeGaps.length === 0,
    incomplete_item_ids: incompleteItemIds,
    scope_gaps: scopeGaps,
  };
}

export function recordPacketExport(project: Project, requestId: string): Project {
  const result = structuredClone(project);
  const exists = result.audit_events.some((event) =>
    event.action === "packet_exported" && event.detail.request_id === requestId
  );
  if (exists) return result;
  const event: AuditEvent = {
    id: `evt_${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    actor: "coordinator",
    actor_name: "",
    action: "packet_exported",
    from_status: null,
    to_status: null,
    rationale: "Exported the current clearance research packet.",
    source_version: result.cut?.label ?? result.script?.label ?? "",
    detail: { request_id: requestId },
  };
  result.audit_events.push(event);
  return result;
}
