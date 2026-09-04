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

    await user.click(screen.getByRole("button", { name: "Coordinator verified" }));

    expect(screen.getByText("Coordinator action")).toBeVisible();
    expect(screen.getByRole("button", { name: "Record disposition" })).toBeDisabled();
  });
});
