import { render, screen } from "@testing-library/react";
import { ProjectSchema } from "@clearcut/contracts";
import fixture from "../../../../../fixtures/project-ready.json";
import { describe, expect, test } from "vitest";

import { ReviewWorkspace } from "./review-workspace";

describe("review workspace", () => {
  test("selected case controls the picture and evidence inspector", () => {
    const project = ProjectSchema.parse(fixture);
    render(<ReviewWorkspace initialCaseId="item_brand" project={project} />);

    expect(screen.getByRole("heading", { name: "Northstar Cola" })).toBeVisible();
    expect(screen.getByTestId("media-canvas")).toHaveAttribute("data-selected-case", "item_brand");
  });
});
