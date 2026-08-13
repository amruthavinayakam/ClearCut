import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ClearanceItem, ProjectRevision, RevisionChange } from "../../types";
import VersionRipple from "./VersionRipple";


function item(id: string, stable: string, name: string, at: number): ClearanceItem {
  return {
    id,
    stable_item_id: stable,
    name,
    category: "artwork",
    description: "",
    provenance: "cut_only",
    source_version: "rough-cut",
    script_references: [],
    cut_detections: [{
      timecode: { start: at, end: at + 4 },
      representative_time: at + 1,
      modality: "visual",
      observation: name,
      confidence: "high",
      scene_match: null,
      expected_from_script: false,
    }],
    detection_confidence: "high",
    research_priority: "high",
    production_impact: "",
    workflow_status: "evidence_ready",
    candidate_rights_holders: [],
    licensing_routes: [],
    sources: [],
    evidence_gaps: [],
    unresolved_questions: [],
    recommended_actions: [],
    research_summary: "",
    research_error: null,
    task_run_id: null,
    documents: [],
    monitor_id: null,
    assigned_to: "",
    draft_request: null,
    audit_events: [],
    color: "amber",
    citation_count: 0,
    is_resolved: false,
  };
}

const changes: RevisionChange[] = [
  { kind: "unchanged", stable_item_id: "brand", item_name: "Northstar Cola", before_item_id: "old_brand", after_item_id: "new_brand", explanation: "Unchanged.", match_basis: "name", previous_status: "evidence_ready" },
  { kind: "added", stable_item_id: "poster", item_name: "Harbor Festival poster", before_item_id: null, after_item_id: "new_poster", explanation: "New.", match_basis: "none", previous_status: null },
  { kind: "removed", stable_item_id: "sign", item_name: "Velvet Room sign", before_item_id: "old_sign", after_item_id: null, explanation: "Removed.", match_basis: "none", previous_status: "evidence_ready" },
  { kind: "materially_changed", stable_item_id: "art", item_name: "Harbor Lights, 1961", before_item_id: "old_art", after_item_id: "new_art", explanation: "Specific work now visible.", match_basis: "source", previous_status: "evidence_ready" },
  { kind: "decision_stale", stable_item_id: "music", item_name: "Midnight Orchard", before_item_id: "old_music", after_item_id: "new_music", explanation: "Use moved.", match_basis: "name", previous_status: "documented_permission" },
];

const previous = {
  id: "rev_1",
  sequence: 1,
  script: null,
  cut: { id: "cut_1", label: "rough-cut-v1", filename: "v1.mp4", duration_s: 80, storage_key: "", mime_type: "video/mp4", size_bytes: 0, media_url: "" },
  state: "applied",
  items: [
    item("old_brand", "brand", "Northstar Cola", 5),
    item("old_sign", "sign", "Velvet Room sign", 20),
    item("old_art", "art", "A framed painting", 30),
    item("old_music", "music", "Midnight Orchard", 40),
  ],
  changes: [],
  predecessor_id: null,
  created_at: "2026-08-13T00:00:00Z",
  applied_at: "2026-08-13T00:01:00Z",
  error: null,
} satisfies ProjectRevision;

const revision = {
  ...previous,
  id: "rev_2",
  sequence: 2,
  state: "ready",
  predecessor_id: "rev_1",
  applied_at: null,
  items: [
    item("new_brand", "brand", "Northstar Cola", 5),
    item("new_poster", "poster", "Harbor Festival poster", 50),
    item("new_art", "art", "Harbor Lights, 1961", 32),
    item("new_music", "music", "Midnight Orchard", 60),
  ],
  changes,
} satisfies ProjectRevision;

describe("VersionRipple", () => {
  it("renders unchanged, new, removed, materially changed, and stale outcomes from stored changes", () => {
    render(<VersionRipple previous={previous} revision={revision} />);

    expect(screen.getAllByLabelText(/unchanged · northstar cola/i)[0]).toHaveAttribute("data-change", "unchanged");
    expect(screen.getByText(/new · harbor festival poster/i)).toBeVisible();
    expect(screen.getByText(/removed · velvet room sign/i)).toBeVisible();
    expect(screen.getByText(/changed · harbor lights, 1961/i)).toBeVisible();
    expect(screen.getByText(/reopened · midnight orchard/i)).toBeVisible();
    expect(screen.getByText(/previous disposition: documented permission/i)).toBeVisible();
  });
});
