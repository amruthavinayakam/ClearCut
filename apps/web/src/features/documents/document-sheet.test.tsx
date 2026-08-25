import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectSchema } from "@clearcut/contracts";
import fixture from "../../../../../fixtures/project-ready.json";
import { describe, expect, test } from "vitest";

import { DocumentSheet } from "./document-sheet";
import { ScopeAssessment } from "./scope-assessment";

describe("recorded document scope", () => {
  test("shows partial scope as a comparison rather than a legal conclusion", () => {
    render(<ScopeAssessment assessment={{ outcome: "partial", gaps: ["Missing media: streaming"] }} />);

    expect(screen.getByText("Partial recorded scope")).toBeVisible();
    expect(screen.getByText("Missing media: streaming")).toBeVisible();
    expect(screen.getByText("Metadata comparison only")).toBeVisible();
  });

  test("opens a production-record form from the case", async () => {
    const user = userEvent.setup();
    render(<DocumentSheet item={ProjectSchema.parse(fixture).items[0]} projectId="proj_fixture" />);

    await user.click(screen.getByRole("button", { name: "Attach production record" }));

    expect(screen.getByRole("dialog", { name: "Attach production record" })).toBeVisible();
    expect(screen.getByLabelText("Document file")).toBeVisible();
  });
});
