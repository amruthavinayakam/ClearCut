import { createApp } from "./app";
import { readConfig } from "./config";
import { FilesystemAssetStore } from "./repositories/filesystem-asset-store";
import { FirestoreProjectRepository } from "./repositories/firestore-project-repository";
import { GcsAssetStore } from "./repositories/gcs-asset-store";
import { FilesystemProjectRepository } from "./repositories/filesystem-project-repository";
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
const repository = bindingClient
  ? new D1ProjectRepository(bindingClient)
  : config.firestoreCollection
    ? new FirestoreProjectRepository({ projectId: config.googleCloudProject, collection: config.firestoreCollection })
    // Local runs still get durable storage: a dev-server restart is not a
    // reason for a coordinator's productions to disappear.
    : new FilesystemProjectRepository(config.projectStorageDir);
const assetStore = bindingClient
  ? new R2AssetStore(bindingClient)
  : config.gcsBucket
    ? new GcsAssetStore({ bucket: config.gcsBucket, projectId: config.googleCloudProject })
    : new FilesystemAssetStore(config.assetStorageDir);
const monitors = new MemoryMonitorRepository();
const events = new ProjectEventBus();
const gemini = config.mockResearch
  ? new FixtureGeminiClient()
  : new LiveGeminiClient({
    apiKey: config.googleApiKey,
    // Prefer Vertex AI when a project is configured: it authenticates with the
    // runtime's own service account, so no key ships with the deployment.
    vertex: config.googleCloudProject
      ? { project: config.googleCloudProject, location: config.googleCloudLocation }
      : undefined,
    model: config.geminiModel,
  });
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
  researchDepth: config.researchDepth,
  caseResearchTimeoutMs: config.caseResearchTimeoutMs,
});
const app = createApp({
  config, repository, assetStore, monitors, events, gemini, parallel,
  jobRunner: {
    start: (projectId) => orchestrator.run(projectId),
    startRevision: (projectId, revisionId) => orchestrator.runRevision(projectId, revisionId),
  },
});

// A run cannot outlive the process that started it, so anything still in a
// non-terminal phase was orphaned by the last shutdown — most often a redeploy.
// Pick those up rather than leaving them analysing forever.
queueMicrotask(() => void orchestrator.recoverInterrupted()
  .then((count) => { if (count > 0) console.log(`Resumed ${count} interrupted production(s)`); })
  .catch((error: unknown) => console.error("Could not resume interrupted productions", error)));

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch: app.fetch,
});

console.log(`ClearCut API listening on ${server.url}`);
