import { createApp } from "./app";
import { readConfig } from "./config";
import { FilesystemAssetStore } from "./repositories/filesystem-asset-store";
import { MemoryProjectRepository } from "./repositories/memory-project-repository";
import { MemoryMonitorRepository } from "./repositories/memory-monitor-repository";
import { ProjectEventBus } from "./services/events";
import { FixtureGeminiClient, FixtureParallelClient, LiveGeminiClient, LiveParallelClient } from "@clearcut/integrations";
import { ProjectOrchestrator } from "./pipeline/orchestrator";

const config = readConfig();
const repository = new MemoryProjectRepository();
const assetStore = new FilesystemAssetStore(config.assetStorageDir);
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
