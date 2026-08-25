import { describe, expect, test } from "bun:test";

import fixture from "../../../fixtures/project-ready.json";
import { ApiErrorSchema, ProjectSchema } from "@clearcut/contracts";
import { createTestApi } from "./test-app";

async function seeded() {
  const api = await createTestApi();
  await api.repository.save(ProjectSchema.parse(fixture));
  return api;
}

describe("guarded case mutations", () => {
  test("rejects an agent human disposition without mutating the item", async () => {
    const { app, repository } = await seeded();
    const response = await app.request("/api/projects/proj_fixture/items/item_brand/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "coordinator_verified",
        actor: "agent",
        rationale: "Research complete.",
      }),
    });

    expect(response.status).toBe(403);
    expect(ApiErrorSchema.parse(await response.json()).code).toBe("human_owned_status");
    expect((await repository.require("proj_fixture")).items[0].workflow_status).toBe("evidence_ready");
  });

  test("rejects unknown workflow states at the request boundary", async () => {
    const { app } = await seeded();
    const response = await app.request("/api/projects/proj_fixture/items/item_brand/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "invented_state", actor: "coordinator", rationale: "No." }),
    });

    expect(response.status).toBe(422);
    expect(ApiErrorSchema.parse(await response.json()).code).toBe("validation_error");
  });

  test("assignment and intended-use updates append auditable state", async () => {
    const { app, repository } = await seeded();
    const assignment = await app.request("/api/projects/proj_fixture/items/item_brand/coordination", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assigned_to: "Mara Chen" }),
    });
    const profile = await app.request("/api/projects/proj_fixture/use-profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ media: ["streaming"], territories: ["US"], starts_on: null, ends_on: null }),
    });

    expect(await assignment.json()).toEqual({ item_id: "item_brand", assigned_to: "Mara Chen" });
    expect((await profile.json()).use_profile.media).toEqual(["streaming"]);
    const project = await repository.require("proj_fixture");
    expect(project.items[0].audit_events.at(-1)?.action).toBe("assignment_changed");
    expect(project.audit_events.at(-1)?.action).toBe("intended_use_updated");
  });
});
