import { describe, expect, test } from "bun:test";
import type { ClearanceItem, ProjectRevision } from "@clearcut/contracts";

import { applyRevision, buildCandidateRevision, compareRevisions, ensureInitialRevision, RevisionComparisonError } from "../src";
import { item, readyProject } from "./helpers";

function at(value: ClearanceItem, start: number): ClearanceItem {
  return {
    ...value,
    cut_detections: [{
      timecode: { start, end: start + 4 },
      representative_time: start + 1,
      modality: "visual",
      observation: value.name,
      confidence: "medium",
      scene_match: null,
      expected_from_script: false,
    }],
  };
}

describe("immutable revisions", () => {
  test("comparison reports all five outcomes", () => {
    const brand = at(item({ name: "Northstar Cola", category: "brand" }), 5);
    const sign = at(item({ name: "Velvet Room sign", category: "signage" }), 18);
    const artwork = item({
      name: "A framed painting",
      category: "artwork",
      script_references: [{ scene_index: 3, scene_heading: "INT. ROOM", page: null, excerpt: "", usage_note: "" }],
    });
    const music = at(item({
      name: "Midnight Orchard",
      category: "music",
      workflow_status: "documented_permission",
      audit_events: [{
        id: "evt_music",
        at: "2026-08-24T13:00:00Z",
        actor: "coordinator",
        actor_name: "",
        action: "status_change",
        from_status: "evidence_ready",
        to_status: "documented_permission",
        rationale: "Licence recorded.",
        source_version: "cut_fixture",
        detail: {},
      }],
    }), 10);
    const previous: ProjectRevision = {
      id: "revision_previous",
      sequence: 1,
      script: null,
      cut: null,
      state: "applied",
      items: [brand, sign, artwork, music],
      changes: [],
      predecessor_id: null,
      created_at: "2026-08-24T12:00:00Z",
      applied_at: "2026-08-24T12:00:00Z",
      error: null,
    };

    const changes = compareRevisions(previous, [
      at(item({ name: "Northstar Cola", category: "brand" }), 5),
      at(item({ name: "Harbor Festival poster", category: "artwork" }), 42),
      item({ name: "Harbor Lights, 1961", category: "artwork", script_references: [{ scene_index: 3, scene_heading: "INT. ROOM", page: null, excerpt: "", usage_note: "" }] }),
      at(item({ name: "Midnight Orchard", category: "music" }), 30),
    ]);
    const kinds = Object.fromEntries(changes.map((change) => [change.item_name, change.kind]));

    expect(kinds).toEqual({
      "Northstar Cola": "unchanged",
      "Harbor Festival poster": "added",
      "Harbor Lights, 1961": "materially_changed",
      "Midnight Orchard": "decision_stale",
      "Velvet Room sign": "removed",
    });
  });

  test("candidate build is detached and retains the unchanged human record", () => {
    const project = readyProject();
    project.items[0].workflow_status = "coordinator_verified";
    project.items[0].research_summary = "Public evidence assembled.";
    project.items[0].audit_events.push({
      id: "evt_review",
      at: "2026-08-24T13:00:00Z",
      actor: "coordinator",
      actor_name: "",
      action: "status_change",
      from_status: "evidence_ready",
      to_status: "coordinator_verified",
      rationale: "Reviewed.",
      source_version: "cut_fixture",
      detail: {},
    });
    ensureInitialRevision(project);
    const before = structuredClone(project);
    const candidate = at(item({ name: "Northstar Cola", category: "brand" }), 14.2);

    const revision = buildCandidateRevision(project, [candidate]);

    expect(revision.items[0].workflow_status).toBe("coordinator_verified");
    expect(revision.items[0].research_summary).toBe("Public evidence assembled.");
    expect(project).toEqual(before);
  });

  test("invalid candidate input leaves the project untouched", () => {
    const project = readyProject();
    ensureInitialRevision(project);
    const before = structuredClone(project);
    expect(() => buildCandidateRevision(project, [null as unknown as ClearanceItem])).toThrow(RevisionComparisonError);
    expect(project).toEqual(before);
  });

  test("apply is predecessor checked and idempotent", () => {
    const project = readyProject();
    const active = ensureInitialRevision(project);
    const candidate = buildCandidateRevision(project, [at(item({ name: "Northstar Cola", category: "brand" }), 14.2)]);
    project.revisions = [...(project.revisions ?? []), candidate];

    try {
      applyRevision(project, candidate.id, "stale");
      throw new Error("Expected a predecessor conflict.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as { code?: string }).code).toBe("revision_conflict");
    }
    expect(applyRevision(project, candidate.id, active.id).already_applied).toBe(false);
    expect(applyRevision(project, candidate.id, active.id).already_applied).toBe(true);
  });
});
