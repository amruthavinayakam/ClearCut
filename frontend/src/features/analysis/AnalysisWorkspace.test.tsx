import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "../../types";
import AnalysisWorkspace from "./AnalysisWorkspace";
import { clearProjectPreferences } from "../projects/project-preferences";


const PROJECT: Project = {
  id: "proj_analysis",
  title: "Night Drive",
  created_at: "2026-08-13T00:00:00Z",
  updated_at: "2026-08-13T00:05:00Z",
  archived_at: null,
  phase: "researching",
  error: null,
  script: null,
  cut: {
    id: "cut_1",
    label: "rough-cut-v1",
    filename: "assembly.mp4",
    duration_s: 60,
    media_url: "/api/projects/proj_analysis/cut",
    storage_key: "a".repeat(32),
    mime_type: "video/mp4",
    size_bytes: 1200,
  },
  items: [
    {
      id: "item_logo",
      stable_item_id: "stable_logo",
      name: "Northstar Cola",
      category: "brand",
      description: "A can appears in frame.",
      provenance: "cut_only",
      source_version: "rough-cut-v1",
      script_references: [],
      cut_detections: [
        {
          timecode: { start: 12, end: 15 },
          representative_time: 13,
          modality: "visual",
          observation: "Can on table",
          confidence: "high",
          scene_match: null,
          expected_from_script: false,
        },
      ],
      detection_confidence: "high",
      research_priority: "high",
      production_impact: "",
      workflow_status: "researching",
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
      color: "red",
      citation_count: 0,
      is_resolved: false,
    },
  ],
  reconciliation: [],
  audit_events: [],
  activity_events: [
    {
      id: "activity_1",
      at: "2026-08-13T00:04:00Z",
      phase: "scanning_cut",
      message: "One cut element detected.",
      detail: { count: 1 },
    },
  ],
  use_profile: { media: [], territories: [], starts_on: null, ends_on: null },
  active_revision_id: null,
  summary: {
    colors: { red: 1, amber: 0, blue: 0, green: 0, gray: 0 },
    by_category: { brand: 1 },
    total_items: 1,
    unscripted_items: 1,
    resolved_items: 0,
    total_citations: 0,
    reconciliation: {},
    ai_issued_approvals: 0,
  },
};

class FakeEventSource {
  static instance: FakeEventSource;
  static CLOSED = 2;
  readyState = 0;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor() {
    FakeEventSource.instance = this;
  }

  fail() {
    this.readyState = FakeEventSource.CLOSED;
    this.onerror?.();
  }
}

describe("AnalysisWorkspace", () => {
  beforeEach(() => {
    clearProjectPreferences(PROJECT.id);
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => PROJECT,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to polling without clearing visible detections", async () => {
    render(<AnalysisWorkspace initialProject={PROJECT} />);
    expect(screen.getByRole("button", { name: /northstar cola at 00:12/i })).toBeVisible();

    act(() => FakeEventSource.instance.fail());

    expect(await screen.findByText(/live connection paused/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /northstar cola at 00:12/i })).toBeVisible();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it("settles the first Scan Reveal on interaction and does not replay it", async () => {
    const { unmount } = render(<AnalysisWorkspace initialProject={PROJECT} />);
    const signal = screen.getByRole("button", { name: /northstar cola at 00:12/i });
    expect(signal).toHaveAttribute("data-staged", "true");

    await userEvent.click(screen.getByRole("region", { name: /analysis workspace/i }));
    expect(signal).toHaveAttribute("data-staged", "false");
    unmount();

    render(<AnalysisWorkspace initialProject={PROJECT} />);
    expect(screen.getByRole("button", { name: /northstar cola at 00:12/i })).toHaveAttribute(
      "data-staged",
      "false",
    );
  });

  it("skips Scan Reveal staging when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));

    render(<AnalysisWorkspace initialProject={PROJECT} />);

    expect(screen.getByRole("button", { name: /northstar cola at 00:12/i })).toHaveAttribute(
      "data-staged",
      "false",
    );
  });
});
