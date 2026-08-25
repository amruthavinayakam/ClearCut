import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fixture from "../../../../../fixtures/project-ready.json";
import { ProjectSchema, type PreflightResult } from "@clearcut/contracts";
import { describe, expect, test, vi } from "vitest";

import { IntakeForm } from "@/app/(product)/projects/new/intake-form";
import type { UploadClient } from "./upload-client";

function result(file: File, accepted: boolean): PreflightResult {
  return {
    kind: file.name.endsWith(".pdf") ? "screenplay" : "cut",
    filename: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    accepted,
    details: accepted ? { scene_count: 42 } : {},
    errors: accepted ? [] : [{ code: "unreadable_video", message: "The video container is unreadable" }],
  };
}

describe("new scan intake", () => {
  test("runs the verified sample and opens its project workspace", async () => {
    const client = {
      preflight: vi.fn(),
      createProject: vi.fn(),
      createSampleProject: vi.fn(async () => ProjectSchema.parse(fixture)),
    };
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/projects/new");
    render(<IntakeForm client={client} />);

    await user.click(screen.getByRole("button", { name: "Run real sample" }));

    expect(window.location.pathname).toBe("/projects/proj_fixture");
  });

  test("preserves the valid screenplay when the cut fails preflight", async () => {
    const client: UploadClient = {
      preflight: vi.fn(async (file) => result(file, file.name.endsWith(".pdf"))),
      createProject: vi.fn(),
      createSampleProject: vi.fn(),
    };
    const user = userEvent.setup();
    render(<IntakeForm client={client} />);

    await user.upload(screen.getByLabelText("Screenplay file"), new File(["screenplay"], "draft.pdf", { type: "application/pdf" }));
    await user.upload(screen.getByLabelText("Rough cut file"), new File(["video"], "cut.mp4", { type: "video/mp4" }));

    expect(await screen.findByText("Screenplay ready")).toBeVisible();
    expect(await screen.findByText("The video container is unreadable")).toBeVisible();
  });
});
