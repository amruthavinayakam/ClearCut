import { expect, test } from "bun:test";

import { ApiErrorSchema, AppConfigSchema, HealthSchema } from "@clearcut/contracts";
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
