import { createApp } from "./app";
import { readConfig } from "./config";
import { FilesystemAssetStore } from "./repositories/filesystem-asset-store";
import { MemoryProjectRepository } from "./repositories/memory-project-repository";
import { MemoryMonitorRepository } from "./repositories/memory-monitor-repository";
import { ProjectEventBus } from "./services/events";
import { FixtureGeminiClient, FixtureParallelClient, LiveGeminiClient, LiveParallelClient } from "@clearcut/integrations";
import { ProjectOrchestrator } from "./pipeline/orchestrator";
import { CloudflareBindingClient } from "./repositories/cloudflare-binding-client";
import { D1ProjectRepository } from "./repositories/d1-project-repository";
import { R2AssetStore } from "./repositories/r2-asset-store";

const config = readConfig();
const bindingClient = config.cloudflareBindingOrigin
  ? new CloudflareBindingClient({ origin: config.cloudflareBindingOrigin, nonce: config.cloudflareBindingNonce })
  : null;
const repository = bindingClient ? new D1ProjectRepository(bindingClient) : new MemoryProjectRepository();
const assetStore = bindingClient ? new R2AssetStore(bindingClient) : new FilesystemAssetStore(config.assetStorageDir);
const monitors = new MemoryMonitorRepository();
const events = new ProjectEventBus();
const gemini = config.mockResearch
  ? new FixtureGeminiClient()
  : new LiveGeminiClient({ apiKey: config.googleApiKey, model: config.geminiModel });
const parallel = config.mockResearch
  ? new FixtureParallelClient()
  : new LiveParallelClient({
    apiKey: config.parallelApiKey,
    processor: config.parallelProcessor,
    monitorProcessor: config.parallelMonitorProcessor,
    publicBaseUrl: config.publicBaseUrl,
  });
const orchestrator = new ProjectOrchestrator({
  repository,
  assetStore,
  gemini,
  parallel,
  events,
  researchConcurrency: config.researchConcurrency,
});
const app = createApp({
  config, repository, assetStore, monitors, events, gemini, parallel,
  jobRunner: {
    start: (projectId) => orchestrator.run(projectId),
    startRevision: (projectId, revisionId) => orchestrator.runRevision(projectId, revisionId),
  },
});

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch: app.fetch,
});

console.log(`ClearCut API listening on ${server.url}`);
