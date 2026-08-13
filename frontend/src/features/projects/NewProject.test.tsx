import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../api/client";
import NewProject from "./NewProject";


vi.mock("../../api/client", () => ({
  api: {
    preflight: vi.fn(),
    createProject: vi.fn(),
  },
}));

const preflight = vi.mocked(api.preflight);

function acceptedScript(filename: string) {
  return {
    kind: "screenplay" as const,
    filename,
    mime_type: "text/plain",
    size_bytes: 1200,
    accepted: true,
    details: { page_count: 2, scene_count: 5, readable_text: true },
    errors: [],
  };
}

describe("NewProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a valid screenplay when the cut fails preflight", async () => {
    preflight.mockImplementation(async (file) =>
      file.name.endsWith(".mov")
        ? {
            kind: "cut",
            filename: file.name,
            mime_type: "video/quicktime",
            size_bytes: file.size,
            accepted: false,
            details: {},
            errors: [{ code: "unreadable_container", message: "Duration could not be read." }],
          }
        : acceptedScript(file.name),
    );
    render(<NewProject onCreated={vi.fn()} />);
    const input = screen.getByLabelText("Choose screenplay");

    await userEvent.upload(input, new File(["INT. ROOM"], "first.fountain", { type: "text/plain" }));
    await screen.findByText("first.fountain");
    await userEvent.upload(input, new File(["INT. ROAD"], "revised.fountain", { type: "text/plain" }));
    await screen.findByText("revised.fountain");
    fireEvent.drop(screen.getByTestId("cut-dropzone"), {
      dataTransfer: {
        files: [new File(["broken"], "assembly.mov", { type: "video/quicktime" })],
      },
    });

    expect(await screen.findByText("Duration could not be read.")).toBeVisible();
    expect(screen.getByText("revised.fountain")).toBeVisible();
    expect(screen.queryByText("first.fountain")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start clearance analysis" })).toBeEnabled();
  });

  it("removes an accepted file and disables submission", async () => {
    preflight.mockImplementation(async (file) => acceptedScript(file.name));
    render(<NewProject onCreated={vi.fn()} />);
    const file = new File(["INT. ROOM"], "film.fountain", { type: "text/plain" });

    await userEvent.upload(screen.getByLabelText("Choose screenplay"), file);
    await screen.findByText("film.fountain");
    await userEvent.click(screen.getByRole("button", { name: "Remove film.fountain" }));

    expect(screen.getByRole("button", { name: "Start clearance analysis" })).toBeDisabled();
  });

  it("treats cut drop and file picking equivalently", async () => {
    preflight.mockResolvedValue({
      kind: "cut",
      filename: "rough-cut.mp4",
      mime_type: "video/mp4",
      size_bytes: 2_400_000,
      accepted: true,
      details: { duration_s: 42.5 },
      errors: [],
    });
    render(<NewProject onCreated={vi.fn()} />);

    fireEvent.drop(screen.getByTestId("cut-dropzone"), {
      dataTransfer: { files: [new File(["video"], "rough-cut.mp4", { type: "video/mp4" })] },
    });

    await waitFor(() => expect(preflight).toHaveBeenCalled());
    expect(await screen.findByText(/42\.5 seconds/i)).toBeVisible();
    expect(screen.getByText(/the rough cut will be analyzed without screenplay context/i)).toBeVisible();
  });
});
