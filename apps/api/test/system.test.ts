import { expect, test } from "bun:test";

import { ApiErrorSchema, AppConfigSchema, HealthSchema, ProjectSchema } from "@clearcut/contracts";

import fixture from "../../../fixtures/project-ready.json";
import { createTestApi } from "./test-app";

test("health and public configuration use shared contracts", async () => {
  const { app } = await createTestApi();
  const health = await app.request("/api/health");
  const config = await app.request("/api/config");

  expect(HealthSchema.parse(await health.json())).toEqual({ status: "ok" });
  expect(AppConfigSchema.parse(await config.json())).toMatchObject({
    mock_research: true,
    asset_store: "filesystem",
    sample_available: true,
  });
});

test("unknown resources return a stable request-correlated error", async () => {
  const { app } = await createTestApi();
  const response = await app.request("/api/projects/missing");
  const error = ApiErrorSchema.parse(await response.json());

  expect(response.status).toBe(404);
  expect(error.code).toBe("project_not_found");
  expect(error.request_id).toMatch(/^req_/);

});

test("responses compress, but the progress stream never does", async () => {
  const { app, repository } = await createTestApi();
  const project = ProjectSchema.parse(fixture);
  await repository.save(project);

  const record = await app.request(`/api/projects/${project.id}`, {
    headers: { "accept-encoding": "gzip" },
  });
  expect(record.headers.get("content-encoding")).toBe("gzip");

  // Compressing an event stream buffers it, and the only reason that endpoint
  // exists is that events arrive as they happen.
  const stream = await app.request(`/api/projects/${project.id}/stream`, {
    headers: { "accept-encoding": "gzip" },
  });
  expect(stream.headers.get("content-type")).toContain("text/event-stream");
  expect(stream.headers.get("content-encoding")).toBeNull();
});
