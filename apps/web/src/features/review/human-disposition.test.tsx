import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectSchema } from "@clearcut/contracts";
import fixture from "../../../../../fixtures/project-ready.json";
import { describe, expect, test, vi } from "vitest";

import { HumanDisposition } from "./human-disposition";

describe("human disposition", () => {
  test("names the human actor and requires a rationale", async () => {
    const item = ProjectSchema.parse(fixture).items[0];
    const user = userEvent.setup();
    render(<HumanDisposition client={{ setStatus: vi.fn() }} item={item} projectId="proj_fixture" />);

    // The outcomes moved into the dialog: the panel offers one action, and the
    // choice is made where the actor and reason are already being asked for.
    await user.click(screen.getByRole("button", { name: "Record a decision" }));
    await user.click(screen.getByRole("button", { name: /I verified this/ }));

    expect(screen.getByText("I verified this", { selector: "h2, [data-slot='alert-dialog-title']" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save decision" })).toBeDisabled();
  });
});
