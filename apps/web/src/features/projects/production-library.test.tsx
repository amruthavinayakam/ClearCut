import { render, screen } from "@testing-library/react";
import type { ProjectListItem } from "@clearcut/contracts";
import { describe, expect, test } from "vitest";

import { ProductionLibrary } from "@/app/(product)/_components/production-library";

const project: ProjectListItem = {
  id: "proj_001",
  title: "The Long Way Down",
  phase: "ready",
  created_at: "2026-08-20T12:00:00.000Z",
  updated_at: "2026-08-24T12:00:00.000Z",
  script_label: "Draft 7",
  cut_label: "Rough cut 03",
  unresolved_count: 3,
  total_items: 14,
  state_label: "Needs review",
  archived_at: null,
};

describe("production library", () => {
  test("exposes state, inputs and open work as scannable chips", () => {
    render(<ProductionLibrary archived={false} projects={[project]} />);

    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getByText("Needs review")).toBeVisible();
    // One chip carries both counts, so the row stays a single line.
    expect(screen.getByText("3 of 14 open")).toBeVisible();
    expect(screen.getByText("Script")).toBeVisible();
    expect(screen.getByText("Cut")).toBeVisible();
  });

  test("a running scan reports its phase instead of a workflow state", () => {
    render(<ProductionLibrary archived={false} projects={[{ ...project, phase: "researching", state_label: "Processing" }]} />);

    expect(screen.getByText("Researching")).toBeVisible();
  });
});
