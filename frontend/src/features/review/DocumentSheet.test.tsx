import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../api/client";
import type { ClearanceItem, ProductionDocument } from "../../types";
import DocumentSheet from "./DocumentSheet";


vi.mock("../../api/client", () => ({
  api: {
    attachDocument: vi.fn(),
    deleteDocument: vi.fn(),
    documentUrl: vi.fn(() => "/document"),
  },
}));

const ITEM = {
  id: "item_art",
  stable_item_id: "stable_art",
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
  documents: [],
  monitor_id: null,
  assigned_to: "",
  draft_request: null,
  audit_events: [],
  color: "amber",
  citation_count: 0,
  is_resolved: false,
} satisfies ClearanceItem;

const DOCUMENT = {
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
} satisfies ProductionDocument;

describe("DocumentSheet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uploads evidence with recorded scope and shows the deterministic comparison", async () => {
    vi.mocked(api.attachDocument).mockResolvedValue({
      item_id: ITEM.id,
      document: DOCUMENT,
      scope: { outcome: "covers", gaps: [] },
    });
    const onChanged = vi.fn();
    render(
      <DocumentSheet
        open
        projectId="proj_1"
        item={ITEM}
        useProfile={{ media: ["streaming"], territories: ["US"], starts_on: null, ends_on: null }}
        onClose={vi.fn()}
        onChanged={onChanged}
      />,
    );

    const file = new File(["permission"], "licence.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText(/document file/i), file);
    await userEvent.type(screen.getByLabelText(/^title/i), "Artwork licence");
    await userEvent.type(screen.getByLabelText(/recorded media/i), "streaming");
    await userEvent.type(screen.getByLabelText(/recorded territories/i), "US");
    await userEvent.click(screen.getByLabelText(/perpetual/i));
    await userEvent.click(screen.getByRole("button", { name: /attach document/i }));

    await waitFor(() => expect(api.attachDocument).toHaveBeenCalledWith(
      "proj_1",
      ITEM.id,
      file,
      expect.objectContaining({
        title: "Artwork licence",
        media: "streaming",
        territories: "US",
        perpetual: true,
      }),
    ));
    expect(await screen.findByText(/covers intended use/i)).toBeVisible();
    expect(screen.getByText(/metadata comparison only/i)).toBeVisible();
    expect(onChanged).toHaveBeenCalled();
  });
});
