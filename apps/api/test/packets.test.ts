import { describe, expect, test } from "bun:test";

import fixture from "../../../fixtures/project-ready.json";
import { ProjectSchema } from "@clearcut/contracts";
import { ensureInitialRevision } from "@clearcut/domain";
import { createTestApi } from "./test-app";

describe("clearance packet", () => {
  test("preview uses the current revision and creates no export event", async () => {
    const { app, repository } = await createTestApi();
    const project = ProjectSchema.parse(fixture);
    project.items[0].workflow_status = "reopened_by_revision";
    project.items[0].research_error = "Updated use has not been researched.";
    ensureInitialRevision(project);
    await repository.save(project);

    const response = await app.request("/api/projects/proj_fixture/packet.md");
    const markdown = await response.text();

    expect(response.status).toBe(200);
    expect(markdown).toContain("Clearance Research Packet — Night Drive");
    expect(markdown).toContain("INCOMPLETE RESEARCH");
    expect(markdown).toContain(`Active revision | \`1 · ${project.active_revision_id}\``);
    expect((await repository.require("proj_fixture")).audit_events).toHaveLength(0);
  });

  test("confirmed export is downloadable and idempotent for one request id", async () => {
    const { app, repository } = await createTestApi();
    await repository.save(ProjectSchema.parse(fixture));
    const request = () => app.request("/api/projects/proj_fixture/packet-exports", {
      method: "POST",
      headers: { "x-request-id": "export_request_1" },
    });
    const first = await request();
    const second = await request();

    expect(first.headers.get("content-disposition") ?? "").toMatch(/^attachment;/);
    expect(await first.text()).toContain("Research for human legal review");
    expect(second.status).toBe(200);
    expect((await repository.require("proj_fixture")).audit_events.filter((event) => event.action === "packet_exported")).toHaveLength(1);
  });
});
