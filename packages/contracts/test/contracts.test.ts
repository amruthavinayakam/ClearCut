import { describe, expect, test } from "bun:test";

import fixture from "../../../fixtures/project-ready.json";
import { ProjectSchema, ProjectStreamEventSchema } from "../src";

describe("shared contracts", () => {
  test("parses the ready-project parity fixture", () => {
    expect(ProjectSchema.parse(fixture).id).toBe("proj_fixture");
  });

  test("rejects an incomplete progress stream event", () => {
    expect(() => ProjectStreamEventSchema.parse({ type: "progress" })).toThrow();
  });
});
