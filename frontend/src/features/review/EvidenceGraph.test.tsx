import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ClearanceItem, Project } from "../../types";
import EvidenceGraph from "./EvidenceGraph";
import ReviewWorkspace from "./ReviewWorkspace";


const ITEM = {
  id: "item_art",
  stable_item_id: "stable_art",
  name: "Harbor Lights, 1961",
  category: "artwork",
  description: "A signed painting appears behind the lead.",
  provenance: "cut_only",
  source_version: "rough-cut-v1",
  script_references: [],
  cut_detections: [
    {
      timecode: { start: 12, end: 18 },
      representative_time: 14,
      modality: "visual",
      observation: "Signed painting in a medium shot.",
      confidence: "high",
      scene_match: null,
      expected_from_script: false,
    },
  ],
  detection_confidence: "high",
  research_priority: "high",
  production_impact: "Replace or clear before delivery.",
  workflow_status: "evidence_ready",
  candidate_rights_holders: [],
  licensing_routes: [],
  sources: [],
  evidence_gaps: ["Artist estate has not been confirmed."],
  unresolved_questions: [],
  recommended_actions: ["Confirm the artist credit with the art department."],
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
} satisfies ClearanceItem;

const PROJECT = {
  id: "proj_review",
  title: "Night Drive",
  created_at: "2026-08-13T00:00:00Z",
  updated_at: "2026-08-13T01:00:00Z",
  archived_at: null,
  phase: "ready",
  error: null,
  script: null,
  cut: {
    id: "cut_1",
    label: "rough-cut-v1",
    filename: "assembly.mp4",
    duration_s: 60,
    media_url: "/api/projects/proj_review/cut",
    storage_key: "a".repeat(32),
    mime_type: "video/mp4",
    size_bytes: 1200,
  },
  items: [ITEM],
  reconciliation: [],
  audit_events: [],
  activity_events: [],
  use_profile: { media: [], territories: [], starts_on: null, ends_on: null },
  active_revision_id: null,
  summary: {
    colors: { red: 0, amber: 1, blue: 0, green: 0, gray: 0 },
    by_category: { artwork: 1 },
    total_items: 1,
    unscripted_items: 1,
    resolved_items: 0,
    total_citations: 0,
    reconciliation: {},
    ai_issued_approvals: 0,
  },
} satisfies Project;


describe("EvidenceGraph", () => {
  it("renders a linear unscripted relationship without empty branches", () => {
    render(<EvidenceGraph item={ITEM} />);

    expect(screen.getByRole("button", { name: /frame 00:12/i })).toBeVisible();
    expect(screen.getByText(/none — unscripted/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /harbor lights, 1961/i })).toBeVisible();
    expect(screen.queryByText(/production documents/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /evidence gaps/i })).toBeVisible();
  });

  it("selects a source branch for the inspector", async () => {
    const onSelectNode = vi.fn();
    const withSource: ClearanceItem = {
      ...ITEM,
      sources: [
        {
          url: "https://example.com/catalogue",
          title: "Estate catalogue",
          excerpt: "Catalogue record for the work.",
          publish_date: null,
          retrieved_at: "2026-08-13T00:00:00Z",
          via: "parallel_search",
          field: "rights holder",
        },
      ],
    };
    render(<EvidenceGraph item={withSource} onSelectNode={onSelectNode} />);

    await userEvent.click(screen.getByRole("button", { name: /public sources · 1/i }));

    expect(onSelectNode).toHaveBeenCalledWith(expect.objectContaining({ kind: "sources" }));
  });
});


describe("ReviewWorkspace", () => {
  it("deep-links selection and seeks from the case rail", async () => {
    window.history.replaceState({}, "", "/projects/proj_review");
    render(<ReviewWorkspace initialProject={PROJECT} monitors={[]} onRefresh={vi.fn()} />);

    await userEvent.click(
      within(screen.getByRole("complementary", { name: /clearance cases/i })).getByRole(
        "button",
        { name: /harbor lights, 1961/i },
      ),
    );

    expect(window.location.search).toBe("?item=item_art");
    expect(screen.getByRole("button", { name: /harbor lights, 1961 at 00:12/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
