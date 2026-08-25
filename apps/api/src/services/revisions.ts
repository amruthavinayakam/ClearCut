import {
  ProjectRevisionSchema,
  ProjectRevisionSummarySchema,
  type ProjectRevision,
  type ProjectRevisionSummary,
} from "@clearcut/contracts";

export function revisionSummary(revision: ProjectRevision): ProjectRevisionSummary {
  const changeCounts = {
    unchanged: 0,
    added: 0,
    removed: 0,
    materially_changed: 0,
    decision_stale: 0,
  };
  for (const change of revision.changes) changeCounts[change.kind] += 1;
  const { items: _items, ...summary } = revision;
  return ProjectRevisionSummarySchema.parse({
    ...summary,
    item_count: revision.items.length,
    change_counts: changeCounts,
  });
}

export function processingRevision(input: {
  sequence: number;
  script: ProjectRevision["script"];
  cut: ProjectRevision["cut"];
  predecessorId: string;
}): ProjectRevision {
  return ProjectRevisionSchema.parse({
    id: `revision_${crypto.randomUUID()}`,
    sequence: input.sequence,
    script: input.script,
    cut: input.cut,
    state: "processing",
    items: [],
    changes: [],
    predecessor_id: input.predecessorId,
    created_at: new Date().toISOString(),
    applied_at: null,
    error: null,
  });
}
