import { describe, expect, it } from "vitest";

import { parseRoute } from "./router";


describe("parseRoute", () => {
  it("maps every product route", () => {
    expect(parseRoute("/")).toEqual({ name: "projects" });
    expect(parseRoute("/projects/new")).toEqual({ name: "new-project" });
    expect(parseRoute("/projects/proj_1")).toEqual({
      name: "project",
      projectId: "proj_1",
    });
    expect(parseRoute("/projects/proj_1/revisions/new")).toEqual({
      name: "new-revision",
      projectId: "proj_1",
    });
    expect(parseRoute("/projects/proj_1/revisions/rev_2")).toEqual({
      name: "revision",
      projectId: "proj_1",
      revisionId: "rev_2",
    });
    expect(parseRoute("/projects/proj_1/packet")).toEqual({
      name: "packet",
      projectId: "proj_1",
    });
  });

  it("falls back to a deliberate not-found route", () => {
    expect(parseRoute("/not-a-product-route")).toEqual({
      name: "not-found",
      path: "/not-a-product-route",
    });
  });
});
