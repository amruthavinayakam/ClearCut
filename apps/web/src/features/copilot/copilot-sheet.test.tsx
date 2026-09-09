import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { CopilotStreamEvent } from "@/lib/project-actions";

import { CopilotSheet } from "./copilot-sheet";

function streamOf(...events: CopilotStreamEvent[]) {
  return async function* () {
    for (const event of events) yield event;
  }();
}

describe("clearance copilot", () => {
  test("answers from project context without exposing a decision command", async () => {
    const ask = vi.fn();
    const askStream = vi.fn(() => streamOf(
      { type: "delta", text: "The current record identifies " },
      { type: "delta", text: "one candidate holder." },
      { type: "done", citations: [] },
    ));
    const user = userEvent.setup();
    render(<CopilotSheet client={{ ask, askStream }} projectId="proj_fixture" />);

    await user.click(screen.getByRole("button", { name: "Ask ClearCut" }));
    await user.type(screen.getByLabelText("Question"), "Who should we contact?");
    await user.click(screen.getByRole("button", { name: "Send question" }));

    // The deltas are assembled into one rendered answer.
    expect(await screen.findByText("The current record identifies one candidate holder.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  test("renders the answer as markdown and lists its citations", async () => {
    const askStream = vi.fn(() => streamOf(
      { type: "delta", text: "**Two gaps** remain:\n\n- chain of title\n- music cue\n" },
      { type: "done", citations: ["https://example.test/policy"] },
    ));
    const user = userEvent.setup();
    render(<CopilotSheet client={{ ask: vi.fn(), askStream }} projectId="proj_fixture" />);

    await user.click(screen.getByRole("button", { name: "Ask ClearCut" }));
    await user.type(screen.getByLabelText("Question"), "What is missing?");
    await user.click(screen.getByRole("button", { name: "Send question" }));

    // Markdown becomes real elements rather than literal asterisks and hyphens.
    expect(await screen.findByText("Two gaps")).toBeVisible();
    expect(screen.getByText("Two gaps").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem").map((node) => node.textContent))
      .toEqual(expect.arrayContaining(["chain of title", "music cue"]));
    expect(screen.getByRole("link", { name: "https://example.test/policy" })).toBeVisible();
  });

  test("surfaces a stream error in place of the answer", async () => {
    const askStream = vi.fn(() => streamOf({ type: "error", message: "Gemini is unavailable." }));
    const user = userEvent.setup();
    render(<CopilotSheet client={{ ask: vi.fn(), askStream }} projectId="proj_fixture" />);

    await user.click(screen.getByRole("button", { name: "Ask ClearCut" }));
    await user.type(screen.getByLabelText("Question"), "Anything?");
    await user.click(screen.getByRole("button", { name: "Send question" }));

    expect(await screen.findByText("Gemini is unavailable.")).toBeVisible();
  });
});
