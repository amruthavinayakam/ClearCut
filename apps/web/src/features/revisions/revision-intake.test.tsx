import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProjectRevision } from "@clearcut/contracts";
import { describe, expect, test, vi } from "vitest";

import { RevisionIntake } from "./revision-intake";

describe("revision intake", () => {
  test("accepts one changed source and starts an immutable comparison", async () => {
    const revision: ProjectRevision = { id: "rev_2", sequence: 2, script: null, cut: null, state: "processing", items: [], changes: [], predecessor_id: "rev_1", created_at: "2026-08-24T12:00:00Z", applied_at: null, error: null };
    const createRevision = vi.fn(async () => revision);
    const user = userEvent.setup();
    render(<RevisionIntake client={{ createRevision }} projectId="proj_fixture" />);

    await user.upload(screen.getByLabelText("Revised screenplay file"), new File(["INT. DINER - NIGHT"], "draft-8.fountain", { type: "text/plain" }));
    await user.click(screen.getByRole("button", { name: "Compare new version" }));

    expect(createRevision).toHaveBeenCalledWith("proj_fixture", expect.any(File), null);
  });
});
