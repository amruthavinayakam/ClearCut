import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../api/client";
import type { Project } from "../../types";
import PacketPreview from "./PacketPreview";


vi.mock("../../api/client", () => ({
  api: {
    getProject: vi.fn(),
    confirmPacketExport: vi.fn(),
  },
}));

const project = {
  id: "proj_packet",
  title: "Night Drive",
  created_at: "2026-08-13T00:00:00Z",
  updated_at: "2026-08-13T01:00:00Z",
  archived_at: null,
  phase: "ready",
  error: null,
  script: null,
  cut: null,
  items: [
    {
      id: "item_reopened",
      stable_item_id: "stable_reopened",
      name: "Midnight Orchard",
      category: "music",
      description: "Recording use changed.",
      provenance: "cut_only",
      source_version: "rough-cut-v2",
      script_references: [],
      cut_detections: [],
      detection_confidence: "high",
      research_priority: "high",
      production_impact: "",
      workflow_status: "reopened_by_revision",
      candidate_rights_holders: [],
      licensing_routes: [],
      sources: [],
      evidence_gaps: [],
      unresolved_questions: [],
      recommended_actions: [],
      research_summary: "",
      research_error: "Use changed.",
      task_run_id: null,
      documents: [{
        id: "doc_1",
        kind: "license",
        title: "Festival licence",
        notes: "",
        covers_territory: "",
        covers_term: "",
        covers_media: "",
        original_filename: "festival.pdf",
        mime_type: "application/pdf",
        size_bytes: 10,
        storage_key: "a".repeat(32),
        media: ["festival"],
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
      color: "red",
      citation_count: 0,
      is_resolved: false,
    },
  ],
  reconciliation: [],
  audit_events: [],
  activity_events: [],
  use_profile: { media: ["streaming"], territories: ["US"], starts_on: null, ends_on: null },
  active_revision_id: "revision_2",
  summary: {
    colors: { red: 1, amber: 0, blue: 0, green: 0, gray: 0 },
    by_category: { music: 1 },
    total_items: 1,
    unscripted_items: 1,
    resolved_items: 0,
    total_citations: 0,
    reconciliation: {},
    ai_issued_approvals: 0,
  },
} satisfies Project;

describe("PacketPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getProject).mockResolvedValue(project);
    vi.mocked(api.confirmPacketExport).mockResolvedValue(new Blob(["packet"]));
    Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:packet"), configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("renders semantic incomplete-state and scope detail, then confirms audited export", async () => {
    render(<PacketPreview projectId={project.id} />);

    expect(await screen.findByRole("heading", { name: "Night Drive" })).toBeVisible();
    expect(screen.getByText(/incomplete research/i)).toBeVisible();
    expect(screen.getByText(/streaming is not listed in recorded media/i)).toBeVisible();
    expect(screen.getByRole("article", { name: /midnight orchard/i })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /export current packet/i }));
    const dialog = screen.getByRole("dialog", { name: /export current packet/i });
    expect(within(dialog).getByText(/records an audit event/i)).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: /export markdown packet/i }));

    expect(api.confirmPacketExport).toHaveBeenCalledWith(project.id);
  });
});
