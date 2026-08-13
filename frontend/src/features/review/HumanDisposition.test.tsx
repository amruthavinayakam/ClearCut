import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../api/client";
import type { ClearanceItem } from "../../types";
import EvidenceInspector from "./EvidenceInspector";


vi.mock("../../api/client", () => ({
  api: {
    setStatus: vi.fn(),
    updateCoordination: vi.fn(),
    documentUrl: vi.fn(() => "/document"),
  },
}));

const ITEM = {
  id: "item_art",
  name: "Harbor Lights",
  category: "artwork",
  description: "Painting visible in frame.",
  provenance: "cut_only",
  source_version: "rough-cut-v1",
  script_references: [],
  cut_detections: [],
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
  documents: [{
    id: "doc_1",
    kind: "license",
    title: "Artwork licence",
    notes: "",
    covers_territory: "",
    covers_term: "",
    covers_media: "",
    original_filename: "licence.pdf",
    mime_type: "application/pdf",
    size_bytes: 10,
    storage_key: "a".repeat(32),
    media: ["streaming"],
    territories: ["US"],
    starts_on: null,
    ends_on: null,
    perpetual: true,
    covered_use: "",
    attached_at: "2026-08-13T00:00:00Z",
    attached_by: "Mara Chen",
  }],
  monitor_id: null,
  assigned_to: "",
  draft_request: null,
  audit_events: [],
  color: "amber",
  citation_count: 0,
  is_resolved: false,
} satisfies ClearanceItem;

describe("human disposition controls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires confirmation, rationale, and selected evidence for documented permission", async () => {
    vi.mocked(api.setStatus).mockResolvedValue({ item_id: ITEM.id, status: "documented_permission" });
    render(
      <EvidenceInspector
        projectId="proj_1"
        item={ITEM}
        useProfile={{ media: ["streaming"], territories: ["US"], starts_on: null, ends_on: null }}
        onChanged={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /record permission/i }));
    const dialog = screen.getByRole("dialog", { name: /record documented permission/i });
    await userEvent.click(within(dialog).getByLabelText(/artwork licence/i));
    await userEvent.type(within(dialog).getByLabelText(/rationale/i), "Countersigned licence received.");
    await userEvent.click(within(dialog).getByRole("button", { name: /record disposition/i }));

    expect(api.setStatus).toHaveBeenCalledWith(
      "proj_1",
      ITEM.id,
      "documented_permission",
      "coordinator",
      "Countersigned licence received.",
      "",
      ["doc_1"],
    );
  });
});
