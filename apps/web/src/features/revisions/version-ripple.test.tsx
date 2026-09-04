import { render, screen } from "@testing-library/react";
import type { ProjectRevision } from "@clearcut/contracts";
import { describe, expect, test } from "vitest";

import { VersionRipple } from "./version-ripple";

const revision: ProjectRevision = {
  id: "revision_2",
  sequence: 2,
  script: null,
  cut: null,
  state: "ready",
  items: [],
  predecessor_id: "revision_1",
  created_at: "2026-08-24T12:00:00Z",
  applied_at: null,
  error: null,
  changes: [
    { kind: "unchanged", stable_item_id: "1", item_name: "Northstar Cola", before_item_id: "a", after_item_id: "a2", explanation: "Same use", match_basis: "stable id", previous_status: "coordinator_verified" },
    { kind: "added", stable_item_id: "2", item_name: "New mural", before_item_id: null, after_item_id: "b", explanation: "New on screen", match_basis: "new", previous_status: null },
    { kind: "removed", stable_item_id: "3", item_name: "Old song", before_item_id: "c", after_item_id: null, explanation: "Removed from cut", match_basis: "missing", previous_status: "evidence_ready" },
    { kind: "materially_changed", stable_item_id: "4", item_name: "City archive", before_item_id: "d", after_item_id: "d2", explanation: "Longer use", match_basis: "semantic", previous_status: "evidence_ready" },
    { kind: "decision_stale", stable_item_id: "5", item_name: "Actor likeness", before_item_id: "e", after_item_id: "e2", explanation: "Scope changed", match_basis: "stable id", previous_status: "counsel_approved" },
  ],
};

describe("Version Ripple", () => {
  test("reports all five comparison outcomes", () => {
    render(<VersionRipple revision={revision} />);
    for (const label of ["Unchanged", "Added", "Removed", "Material change", "Decision stale"]) expect(screen.getByText(label)).toBeVisible();
  });
});
