import type {
  DocumentMetadataPatch,
  ProductionDocument,
  Project,
  ScopeAssessment,
} from "@clearcut/contracts";
import { assessScope } from "@clearcut/domain";

import { ApiProblem } from "../middleware/errors";
import { audit, requireItem } from "./items";

export function commaList(value: string): string[] {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

export function documentScope(project: Project, document: ProductionDocument): ScopeAssessment {
  return assessScope(project.use_profile, {
    media: document.media,
    territories: document.territories,
    starts_on: document.starts_on,
    ends_on: document.ends_on,
    perpetual: document.perpetual,
    covered_use: document.covered_use,
  });
}

export function requireDocument(project: Project, itemId: string, documentId: string): ProductionDocument {
  const item = requireItem(project, itemId);
  const document = item.documents.find((candidate) => candidate.id === documentId);
  if (!document) throw new ApiProblem(404, "document_not_found", "Document not found for this item.");
  return document;
}

export function patchDocument(
  project: Project,
  itemId: string,
  documentId: string,
  patch: DocumentMetadataPatch,
): ProductionDocument {
  const item = requireItem(project, itemId);
  const document = requireDocument(project, itemId, documentId);
  Object.assign(document, patch);
  item.audit_events.push(audit({
    actor: "coordinator",
    action: "document_metadata_updated",
    rationale: `Updated recorded scope for ${document.title}.`,
    sourceVersion: item.source_version,
    detail: { document_id: document.id, fields: Object.keys(patch).sort() },
  }));
  return document;
}
