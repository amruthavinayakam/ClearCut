import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectSchema } from "@clearcut/contracts";
import fixture from "../../../../../fixtures/project-ready.json";
import { describe, expect, test } from "vitest";

import { ReviewWorkspace } from "./review-workspace";

describe("review workspace", () => {
  test("timecoded risk marker seeks the picture to its representative frame", async () => {
    const project = ProjectSchema.parse(fixture);
    const user = userEvent.setup();
    render(<ReviewWorkspace project={project} />);
    const video = screen.getByTestId("media-canvas").querySelector("video")!;
    video.currentTime = 0;

    await user.click(screen.getByRole("button", { name: "Northstar Cola at 16.4 seconds" }));

    expect(video.currentTime).toBe(16.4);
  });

  test("selected case controls the picture and evidence inspector", () => {
    const project = ProjectSchema.parse(fixture);
    render(<ReviewWorkspace initialCaseId="item_brand" project={project} />);

    expect(screen.getByRole("heading", { name: "Northstar Cola" })).toBeVisible();
    expect(screen.getByTestId("media-canvas")).toHaveAttribute("data-selected-case", "item_brand");
  });

  test("switching cases does not carry monitor state into the next case", async () => {
    const project = ProjectSchema.parse(fixture);
    const watched = { ...project.items[0], monitor_id: "mon_fixture" };
    const unwatched = {
      ...project.items[0],
      id: "item_score",
      name: "Fixture score",
      category: "music" as const,
      monitor_id: null,
    };
    project.items = [watched, unwatched];
    const user = userEvent.setup();
    render(<ReviewWorkspace initialCaseId={watched.id} project={project} />);

    expect(screen.getByRole("button", { name: "Monitor active" })).toBeDisabled();
    // The rail row is identified by the case name; the category now reads from
    // an icon rather than a caption beneath the title.
    await user.click(screen.getByRole("button", { name: /Fixture score/, pressed: false }));

    expect(screen.getByRole("button", { name: "Watch for changes" })).toBeEnabled();
  });
});
