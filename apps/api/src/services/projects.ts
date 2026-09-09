import {
  ProjectSchema,
  ProjectSummarySchema,
  type AuditEvent,
  type CutVersion,
  type Project,
  type ProjectListItem,
  type ScriptVersion,
} from "@clearcut/contracts";

import type { ApiDependencies } from "../context";
import type { StoredAsset } from "../repositories/asset-store";

function now(): string {
  return new Date().toISOString();
}

export function projectSummary(project: Project) {
  const colors = { red: 0, amber: 0, blue: 0, green: 0, gray: 0 };
  const byCategory: Record<string, number> = {};
  for (const item of project.items) {
    colors[item.color] += 1;
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
  }
  const auditEvents = [...project.audit_events, ...project.items.flatMap((item) => item.audit_events)];
  return ProjectSummarySchema.parse({
    colors,
    by_category: byCategory,
    total_items: project.items.length,
    unscripted_items: project.items.filter((item) => item.provenance === "cut_only").length,
    resolved_items: project.items.filter((item) => item.is_resolved).length,
    total_citations: new Set(project.items.flatMap((item) => item.sources.map((source) => source.url))).size,
    reconciliation: Object.fromEntries(
      ["in_both", "script_only", "cut_only", "materially_changed", "approval_stale"]
        .map((kind) => [kind, project.reconciliation.filter((finding) => finding.kind === kind).length]),
    ),
    ai_issued_approvals: auditEvents.filter((event) =>
      (event.actor === "agent" || event.actor === "system")
      && ["coordinator_verified", "counsel_approved", "documented_permission", "approved_replacement", "false_positive"].includes(event.to_status ?? "")
    ).length,
  });
}

export function withSummary(project: Project): Project {
  return ProjectSchema.parse({ ...project, summary: projectSummary(project) });
}

function stateLabel(project: Project): ProjectListItem["state_label"] {
  if (project.phase === "failed") return "Failed";
  if (project.phase !== "ready") return "Processing";
  if (project.items.some((item) => item.workflow_status.startsWith("reopened_by_"))) return "Reopened";
  if (project.items.length && project.items.every((item) => item.is_resolved)) return "Documented";
  if (project.items.length && project.items.every((item) => item.is_resolved || item.workflow_status === "coordinator_verified")) {
    return "Ready for counsel";
  }
  return "Needs review";
}

export function projectListItem(project: Project): ProjectListItem {
  return {
    id: project.id,
    title: project.title,
    phase: project.phase,
    created_at: project.created_at,
    updated_at: project.updated_at,
    script_label: project.script?.label ?? null,
    cut_label: project.cut?.label ?? null,
    unresolved_count: project.items.filter((item) => !item.is_resolved).length,
    total_items: project.items.length,
    state_label: stateLabel(project),
    archived_at: project.archived_at,
  };
}

export function createProjectRecord(input: {
  id: string;
  title: string;
  scriptAsset: StoredAsset | null;
  scriptDetails: Record<string, unknown> | null;
  cutAsset: StoredAsset | null;
  cutDetails: Record<string, unknown> | null;
}): Project {
  const timestamp = now();
  const script: ScriptVersion | null = input.scriptAsset ? {
    id: `script_${crypto.randomUUID()}`,
    label: "script-v1",
    filename: input.scriptAsset.filename,
    title: String(input.scriptDetails?.title ?? input.title),
    page_count: Number(input.scriptDetails?.page_count ?? 0),
    scene_count: Number(input.scriptDetails?.scene_count ?? 0),
    storage_key: input.scriptAsset.key,
    mime_type: input.scriptAsset.contentType,
    size_bytes: input.scriptAsset.sizeBytes,
    uploaded_at: timestamp,
  } : null;
  const cut: CutVersion | null = input.cutAsset ? {
    id: `cut_${crypto.randomUUID()}`,
    label: "rough-cut-v1",
    filename: input.cutAsset.filename,
    duration_s: Number(input.cutDetails?.duration_s ?? 0),
    storage_key: input.cutAsset.key,
    mime_type: input.cutAsset.contentType,
    size_bytes: input.cutAsset.sizeBytes,
    gcs_uri: null,
    media_url: `/api/projects/${input.id}/cut`,
    uploaded_at: timestamp,
  } : null;
  return ProjectSchema.parse({
    id: input.id,
    title: input.title.trim() || "Untitled production",
    created_at: timestamp,
    updated_at: timestamp,
    archived_at: null,
    phase: "created",
    error: null,
    script,
    cut,
    script_history: script ? [script] : [],
    cut_history: cut ? [cut] : [],
    items: [],
    reconciliation: [],
    audit_events: [],
    activity_events: [],
    use_profile: { media: [], territories: [], starts_on: null, ends_on: null },
    revisions: [],
    active_revision_id: null,
    summary: {
      colors: { red: 0, amber: 0, blue: 0, green: 0, gray: 0 },
      by_category: {},
      total_items: 0,
      unscripted_items: 0,
      resolved_items: 0,
      total_citations: 0,
      reconciliation: {},
      ai_issued_approvals: 0,
    },
  });
}

export async function renameProject(dependencies: ApiDependencies, project: Project, title: string): Promise<Project> {
  const timestamp = now();
  const event: AuditEvent = {
    id: `evt_${crypto.randomUUID()}`,
    at: timestamp,
    actor: "coordinator",
    actor_name: "",
    action: "project_renamed",
    from_status: null,
    to_status: null,
    // The previous title is kept in the trail: a packet exported earlier
    // carries the old name, and the history has to explain that.
    rationale: `Production renamed from "${project.title}" to "${title}".`,
    source_version: project.cut?.label ?? project.script?.label ?? "",
    detail: { previous_title: project.title },
  };
  return dependencies.repository.save(withSummary({
    ...project,
    title,
    updated_at: timestamp,
    audit_events: [...project.audit_events, event],
  }));
}

/**
 * Deletes the record and the media it owns.
 *
 * Assets outlive the project otherwise: they sit in object storage keyed by a
 * project that no longer exists, invisible and unbillable to anything.
 */
export async function deleteProject(dependencies: ApiDependencies, project: Project): Promise<void> {
  const keys = [
    project.script?.storage_key,
    project.cut?.storage_key,
    ...project.revisions?.flatMap((revision) => [revision.script?.storage_key, revision.cut?.storage_key]) ?? [],
    ...project.items.flatMap((item) => item.documents.map((document) => document.storage_key)),
  ].filter((key): key is string => Boolean(key));

  for (const key of new Set(keys)) {
    // One unreachable asset must not strand the record it belongs to.
    await dependencies.assetStore.delete(key).catch(() => undefined);
  }
  await dependencies.repository.remove(project.id);
}

export async function setArchived(dependencies: ApiDependencies, project: Project, archived: boolean): Promise<Project> {
  const timestamp = now();
  const action = archived ? "project_archived" : "project_restored";
  const event: AuditEvent = {
    id: `evt_${crypto.randomUUID()}`,
    at: timestamp,
    actor: "coordinator",
    actor_name: "",
    action,
    from_status: null,
    to_status: null,
    rationale: archived ? "Project moved out of the active library." : "Project restored to the active library.",
    source_version: project.cut?.label ?? project.script?.label ?? "",
    detail: {},
  };
  const changed = withSummary({
    ...project,
    archived_at: archived ? timestamp : null,
    updated_at: timestamp,
    audit_events: [...project.audit_events, event],
  });
  return dependencies.repository.save(changed);
}
