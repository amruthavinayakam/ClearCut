import type { Hono } from "hono";

import type { ApiDependencies, ClearCutEnv } from "../context";

export function registerSystemRoutes(app: Hono<ClearCutEnv>, dependencies: ApiDependencies) {
  app.get("/api/health", (context) => context.json({ status: "ok" }));
  app.get("/api/config", (context) => context.json({
    mock_research: dependencies.config.mockResearch,
    parallel_configured: Boolean(dependencies.config.parallelApiKey) || dependencies.config.mockResearch,
    vertex: false,
    project: null,
    search_mode: "basic",
    processor: dependencies.config.parallelProcessor,
    gcs_bucket: null,
    asset_store: "filesystem",
    webhooks_enabled: Boolean(dependencies.config.publicBaseUrl && dependencies.config.webhookSecret),
    sample_available: true,
  }));
}
