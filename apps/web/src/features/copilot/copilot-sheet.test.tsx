import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { CopilotSheet } from "./copilot-sheet";

describe("clearance copilot", () => {
  test("answers from project context without exposing a decision command", async () => {
    const ask = vi.fn(async () => ({ answer: "The current record identifies one candidate holder.", citations: [], session_id: "chat-1" }));
    const user = userEvent.setup();
    render(<CopilotSheet client={{ ask }} projectId="proj_fixture" />);

    await user.click(screen.getByRole("button", { name: "Ask ClearCut" }));
    await user.type(screen.getByLabelText("Question"), "Who should we contact?");
    await user.click(screen.getByRole("button", { name: "Send question" }));

    expect(await screen.findByText("The current record identifies one candidate holder.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });
});
