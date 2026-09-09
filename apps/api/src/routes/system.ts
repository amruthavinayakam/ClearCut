import type { Hono } from "hono";

import type { ApiDependencies, ClearCutEnv } from "../context";

export function registerSystemRoutes(app: Hono<ClearCutEnv>, dependencies: ApiDependencies) {
  app.get("/api/health", (context) => context.json({ status: "ok" }));
  app.get("/api/config", (context) => context.json({
    mock_research: dependencies.config.mockResearch,
    parallel_configured: Boolean(dependencies.config.parallelApiKey) || dependencies.config.mockResearch,
    // Report the backend actually in use rather than a fixed answer: this is the
    // endpoint anyone inspecting a deployment reads first.
    vertex: Boolean(dependencies.config.googleCloudProject) && !dependencies.config.mockResearch,
    project: dependencies.config.googleCloudProject || null,
    search_mode: "basic",
    processor: dependencies.config.parallelProcessor,
    gcs_bucket: dependencies.config.gcsBucket || null,
    asset_store: dependencies.config.cloudflareBindingOrigin
      ? "r2"
      : dependencies.config.gcsBucket ? "gcs" : "filesystem",
    // Whether a restart keeps the record. Memory and /tmp do not.
    durable: Boolean(dependencies.config.cloudflareBindingOrigin || dependencies.config.firestoreCollection),
    webhooks_enabled: Boolean(dependencies.config.publicBaseUrl && dependencies.config.webhookSecret),
    sample_available: true,
  }));
}
