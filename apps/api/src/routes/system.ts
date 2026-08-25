import type { Hono } from "hono";

import type { ApiDependencies, ClearCutEnv } from "../context";

export function registerSystemRoutes(app: Hono<ClearCutEnv>, dependencies: ApiDependencies) {
  app.get("/api/health", (context) => context.json({ status: "ok" }));
  app.get("/api/config", (context) => context.json({
    mock_research: dependencies.config.mockResearch,
    parallel_configured: Boolean(process.env.PARALLEL_API_KEY) || dependencies.config.mockResearch,
    vertex: process.env.GOOGLE_GENAI_USE_VERTEXAI?.toLocaleLowerCase() !== "false",
    project: process.env.GOOGLE_CLOUD_PROJECT ?? null,
    search_mode: process.env.PARALLEL_SEARCH_MODE ?? "basic",
    processor: process.env.PARALLEL_PROCESSOR ?? "core",
    gcs_bucket: null,
    asset_store: "filesystem",
    webhooks_enabled: Boolean(process.env.PUBLIC_BASE_URL && process.env.PARALLEL_WEBHOOK_SECRET),
    sample_available: true,
  }));
}
