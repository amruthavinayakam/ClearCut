import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ProjectListItem } from "../../types";
import ProjectLibrary from "./ProjectLibrary";


const PROJECT: ProjectListItem = {
  id: "proj_night",
  title: "Night Drive",
  phase: "ready",
  created_at: "2026-08-12T20:00:00Z",
  updated_at: "2026-08-13T01:00:00Z",
  script_label: "script-v2",
  cut_label: "rough-cut-v3",
  unresolved_count: 4,
  total_items: 7,
  state_label: "Needs review",
  archived_at: null,
};


describe("ProjectLibrary", () => {
  it("shows the first-run statement and primary action", () => {
    render(<ProjectLibrary projects={[]} sampleAvailable />);

    expect(
      screen.getByRole("heading", { name: /find what entered between the page and the screen/i }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /new clearance scan/i })).toHaveAttribute(
      "href",
      "/projects/new",
    );
    expect(screen.getByRole("button", { name: /open example project/i })).toBeVisible();
  });

  it("filters returning projects by production title", async () => {
    const second = { ...PROJECT, id: "proj_dawn", title: "Before Dawn" };
    render(<ProjectLibrary projects={[PROJECT, second]} sampleAvailable={false} />);

    await userEvent.type(screen.getByRole("searchbox"), "night");

    expect(screen.getByRole("link", { name: /night drive/i })).toBeVisible();
    expect(screen.queryByRole("link", { name: /before dawn/i })).not.toBeInTheDocument();
  });

  it("opens the focused project with Enter", async () => {
    const onOpenProject = vi.fn();
    render(
      <ProjectLibrary
        projects={[PROJECT]}
        sampleAvailable={false}
        onOpenProject={onOpenProject}
      />,
    );

    const row = screen.getByRole("link", { name: /night drive/i });
    row.focus();
    await userEvent.keyboard("{Enter}");

    expect(onOpenProject).toHaveBeenCalledWith("proj_night");
  });
});
