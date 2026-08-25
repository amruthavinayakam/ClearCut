import {
  ClearanceItemSchema,
  type AuditEvent,
  type ClearanceItem,
  type CutVersion,
  type Project,
  type ProjectRevision,
  type RevisionApplyResult,
  type RevisionChange,
  type ScriptVersion,
} from "@clearcut/contracts";

import { applyDisposition, DomainError, hasHumanDecision } from "./status";

export class RevisionComparisonError extends DomainError {
  constructor(message: string) {
    super("revision_comparison_error", message);
    this.name = "RevisionComparisonError";
  }
}

export class RevisionConflictError extends DomainError {
  constructor(message = "The active revision changed. Refresh and compare again.") {
    super("revision_conflict", message);
    this.name = "RevisionConflictError";
  }
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scenes(item: ClearanceItem): Set<number> {
  return new Set(item.script_references.map((reference) => reference.scene_index));
}

function times(item: ClearanceItem): Array<[number, number]> {
  return item.cut_detections.map((detection) => [
    Math.round(detection.timecode.start * 10) / 10,
    Math.round(detection.timecode.end * 10) / 10,
  ]);
}

function equalSets(left: Set<number>, right: Set<number>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function equalTimes(left: Array<[number, number]>, right: Array<[number, number]>): boolean {
  return left.length === right.length && left.every((value, index) => value[0] === right[index]?.[0] && value[1] === right[index]?.[1]);
}

function sourceProximity(before: ClearanceItem, after: ClearanceItem): boolean {
  const beforeScenes = scenes(before);
  const afterScenes = scenes(after);
  if (beforeScenes.size && afterScenes.size && [...beforeScenes].some((scene) => afterScenes.has(scene))) {
    return true;
  }
  return times(before).some(([oldStart]) => times(after).some(([newStart]) => Math.abs(oldStart - newStart) <= 8));
}

function anchorsChanged(before: ClearanceItem, after: ClearanceItem): boolean {
  const beforeScenes = scenes(before);
  const afterScenes = scenes(after);
  if ((beforeScenes.size || afterScenes.size) && !equalSets(beforeScenes, afterScenes)) return true;
  const beforeTimes = times(before);
  const afterTimes = times(after);
  if ((beforeTimes.length || afterTimes.length) && !equalTimes(beforeTimes, afterTimes)) return true;
  return before.provenance !== after.provenance;
}

function revisions(project: Project): ProjectRevision[] {
  if (!project.revisions) project.revisions = [];
  return project.revisions;
}

function activeRevision(project: Project): ProjectRevision {
  const all = revisions(project);
  const active = project.active_revision_id
    ? all.find((revision) => revision.id === project.active_revision_id)
    : all.at(-1);
  if (!active) throw new RevisionComparisonError("The project has no active revision snapshot.");
  return active;
}

export function ensureInitialRevision(project: Project): ProjectRevision {
  const all = revisions(project);
  if (all.length) {
    if (!project.active_revision_id) project.active_revision_id = all.at(-1)?.id ?? null;
    return activeRevision(project);
  }
  const now = new Date().toISOString();
  const revision: ProjectRevision = {
    id: `revision_${crypto.randomUUID()}`,
    sequence: 1,
    script: structuredClone(project.script),
    cut: structuredClone(project.cut),
    state: "applied",
    items: structuredClone(project.items),
    changes: [],
    predecessor_id: null,
    created_at: now,
    applied_at: now,
    error: null,
  };
  all.push(revision);
  project.active_revision_id = revision.id;
  return revision;
}

function findMatches(previousItems: ClearanceItem[], candidates: ClearanceItem[]) {
  const unmatched = new Map(previousItems.map((item) => [item.id, item]));
  const byStable = new Map(previousItems.map((item) => [item.stable_item_id, item]));
  const matches = new Map<string, { item: ClearanceItem; basis: string }>();

  for (const candidate of candidates) {
    const explicit = byStable.get(candidate.stable_item_id);
    if (explicit && unmatched.has(explicit.id)) {
      matches.set(candidate.id, { item: explicit, basis: "explicit stable identity" });
      unmatched.delete(explicit.id);
    }
  }
  for (const candidate of candidates) {
    if (matches.has(candidate.id)) continue;
    const exact = [...unmatched.values()].find((item) =>
      normalize(item.name) === normalize(candidate.name) && item.category === candidate.category
    );
    if (exact) {
      matches.set(candidate.id, { item: exact, basis: "normalized category and name" });
      unmatched.delete(exact.id);
    }
  }
  for (const candidate of candidates) {
    if (matches.has(candidate.id)) continue;
    const nearby = [...unmatched.values()].filter((item) =>
      item.category === candidate.category && sourceProximity(item, candidate)
    );
    if (nearby.length === 1) {
      matches.set(candidate.id, { item: nearby[0], basis: "category and source proximity" });
      unmatched.delete(nearby[0].id);
    }
  }
  return { matches, removed: unmatched };
}

export function compareRevisions(previous: ProjectRevision, candidateItems: ClearanceItem[]): RevisionChange[] {
  const parsed = candidateItems.map((candidate) => ClearanceItemSchema.safeParse(candidate));
  if (parsed.some((result) => !result.success)) {
    throw new RevisionComparisonError("Every revision candidate must be a clearance item.");
  }
  const candidates = parsed.map((result) => result.success ? result.data : neverCandidate());
  if (new Set(candidates.map((item) => item.id)).size !== candidates.length) {
    throw new RevisionComparisonError("Revision candidate item IDs must be unique.");
  }
  const { matches, removed } = findMatches(previous.items, candidates);
  const changes: RevisionChange[] = [];
  for (const candidate of candidates) {
    const match = matches.get(candidate.id);
    if (!match) {
      changes.push({
        kind: "added",
        stable_item_id: candidate.stable_item_id,
        item_name: candidate.name,
        before_item_id: null,
        after_item_id: candidate.id,
        explanation: "New clearance element in the candidate revision.",
        match_basis: "no safe predecessor match",
        previous_status: null,
      });
      continue;
    }
    const identityChanged = normalize(match.item.name) !== normalize(candidate.name)
      || match.item.category !== candidate.category;
    const stale = hasHumanDecision(match.item) && anchorsChanged(match.item, candidate);
    const kind = stale ? "decision_stale" : identityChanged ? "materially_changed" : "unchanged";
    const explanation = kind === "unchanged"
      ? "Identity and recorded source anchors are unchanged."
      : kind === "materially_changed"
        ? "The element became materially more specific or changed identity."
        : "A prior human disposition predates changed source anchors or use.";
    changes.push({
      kind,
      stable_item_id: match.item.stable_item_id,
      item_name: candidate.name,
      before_item_id: match.item.id,
      after_item_id: candidate.id,
      explanation,
      match_basis: match.basis,
      previous_status: match.item.workflow_status,
    });
  }
  for (const removedItem of removed.values()) {
    changes.push({
      kind: "removed",
      stable_item_id: removedItem.stable_item_id,
      item_name: removedItem.name,
      before_item_id: removedItem.id,
      after_item_id: null,
      explanation: "The element is absent from the candidate revision.",
      match_basis: "no safe candidate match",
      previous_status: removedItem.workflow_status,
    });
  }
  return changes;
}

function neverCandidate(): never {
  throw new RevisionComparisonError("Every revision candidate must be a clearance item.");
}

function carryRecord(before: ClearanceItem, after: ClearanceItem): ClearanceItem {
  return {
    ...structuredClone(before),
    id: after.id,
    stable_item_id: before.stable_item_id,
    name: after.name,
    category: after.category,
    description: after.description,
    provenance: after.provenance,
    source_version: after.source_version,
    script_references: structuredClone(after.script_references),
    cut_detections: structuredClone(after.cut_detections),
    detection_confidence: after.detection_confidence,
    research_priority: after.research_priority,
    production_impact: after.production_impact,
  };
}

export function buildCandidateRevision(
  project: Project,
  candidateItems: ClearanceItem[],
  options: { script?: ScriptVersion | null; cut?: CutVersion | null; revisionId?: string } = {},
): ProjectRevision {
  const previous = activeRevision(project);
  const changes = compareRevisions(previous, candidateItems);
  const byAfter = new Map(changes.filter((change) => change.after_item_id).map((change) => [change.after_item_id, change]));
  const previousById = new Map(previous.items.map((item) => [item.id, item]));
  const items = candidateItems.map((candidate) => {
    const change = byAfter.get(candidate.id);
    if (!change) throw new RevisionComparisonError("Candidate comparison is incomplete.");
    if (!change.before_item_id) return structuredClone(candidate);
    const before = previousById.get(change.before_item_id);
    if (!before) throw new RevisionComparisonError("Candidate predecessor is missing.");
    return carryRecord(before, candidate);
  });
  return {
    id: options.revisionId ?? `revision_${crypto.randomUUID()}`,
    sequence: Math.max(0, ...revisions(project).map((revision) => revision.sequence)) + 1,
    script: structuredClone(options.script === undefined ? project.script : options.script),
    cut: structuredClone(options.cut === undefined ? project.cut : options.cut),
    state: "ready",
    items,
    changes,
    predecessor_id: previous.id,
    created_at: new Date().toISOString(),
    applied_at: null,
    error: null,
  };
}

export function applyRevision(
  project: Project,
  revisionId: string,
  predecessorId: string | null,
): RevisionApplyResult {
  const revision = revisions(project).find((candidate) => candidate.id === revisionId);
  if (!revision) throw new RevisionComparisonError("Revision not found.");
  if (revision.state === "applied" && project.active_revision_id === revision.id) {
    return { revision, project, already_applied: true };
  }
  if (revision.state !== "ready") {
    throw new RevisionComparisonError("Only a ready comparison can be applied.");
  }
  if (predecessorId !== revision.predecessor_id || project.active_revision_id !== revision.predecessor_id) {
    throw new RevisionConflictError();
  }

  const promoted = structuredClone(revision.items);
  const byStable = new Map(promoted.map((item) => [item.stable_item_id, item]));
  for (const change of revision.changes) {
    if (change.kind !== "materially_changed" && change.kind !== "decision_stale") continue;
    const target = byStable.get(change.stable_item_id);
    if (!target) continue;
    const reopened = applyDisposition(target, {
      actor: "system",
      status: "reopened_by_revision",
      rationale: change.explanation,
      detail: {
        revision_id: revision.id,
        previous_status: change.previous_status,
        before_item_id: change.before_item_id,
        after_item_id: change.after_item_id,
      },
    });
    Object.assign(target, reopened);
  }

  project.items = promoted;
  project.script = structuredClone(revision.script);
  project.cut = structuredClone(revision.cut);
  project.script_history ??= [];
  project.cut_history ??= [];
  if (project.script && !project.script_history.some((version) => version.id === project.script?.id)) {
    project.script_history.push(structuredClone(project.script));
  }
  if (project.cut && !project.cut_history.some((version) => version.id === project.cut?.id)) {
    project.cut_history.push(structuredClone(project.cut));
  }
  const now = new Date().toISOString();
  project.active_revision_id = revision.id;
  revision.state = "applied";
  revision.applied_at = now;
  project.updated_at = now;
  const event: AuditEvent = {
    id: `evt_${crypto.randomUUID()}`,
    at: now,
    actor: "coordinator",
    actor_name: "",
    action: "revision_applied",
    from_status: null,
    to_status: null,
    rationale: `Applied revision ${revision.sequence} after reviewing its comparison.`,
    source_version: project.cut?.label ?? project.script?.label ?? "",
    detail: {
      revision_id: revision.id,
      predecessor_id: revision.predecessor_id,
      reopened: revision.changes.filter((change) => change.kind === "materially_changed" || change.kind === "decision_stale").length,
    },
  };
  project.audit_events.push(event);
  return { revision, project, already_applied: false };
}
