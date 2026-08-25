import { render, screen } from "@testing-library/react";
import { ProjectSchema, type Project } from "@clearcut/contracts";
import fixture from "../../../../../fixtures/project-ready.json";
import { describe, expect, test, vi } from "vitest";

import { AnalysisWorkspace, type ProjectFeed, type ProjectReader } from "./analysis-workspace";

const processing: Project = ProjectSchema.parse({ ...fixture, phase: "researching" });

describe("analysis workspace", () => {
  test("surfaces polling recovery when the live feed fails", async () => {
    const feed: ProjectFeed = {
      subscribe({ onError }) {
        queueMicrotask(onError);
        return () => undefined;
      },
    };
    const reader: ProjectReader = { getProject: vi.fn(async () => processing) };

    render(<AnalysisWorkspace feed={feed} initialProject={processing} reader={reader} />);

    expect(await screen.findByText("Polling for updates")).toBeVisible();
    expect(reader.getProject).toHaveBeenCalledWith(processing.id);
  });
});
