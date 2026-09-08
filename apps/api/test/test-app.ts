import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApp, type ApiDependencies } from "../src/app";
import type { ApiConfig } from "../src/config";
import { FilesystemAssetStore } from "../src/repositories/filesystem-asset-store";
import { MemoryProjectRepository } from "../src/repositories/memory-project-repository";
import { MemoryMonitorRepository } from "../src/repositories/memory-monitor-repository";
import { ProjectEventBus } from "../src/services/events";
import { FixtureGeminiClient, FixtureParallelClient } from "@clearcut/integrations";

type TestApiOverrides = Omit<Partial<ApiDependencies>, "config"> & {
  config?: Partial<ApiConfig>;
};

export async function createTestApi(overrides: TestApiOverrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "clearcut-api-"));
  const repository = new MemoryProjectRepository();
  const assetStore = new FilesystemAssetStore(root);
  const config: ApiConfig = {
    host: "127.0.0.1",
    port: 3001,
    assetStorageDir: root,
    ffprobePath: "ffprobe",
    maxUploadBytes: 2_000_000,
    mockResearch: true,
    researchConcurrency: 4,
    googleApiKey: "",
    geminiModel: "gemini-3.8-flash",
    parallelApiKey: "",
    parallelProcessor: "core",
    parallelMonitorProcessor: "lite",
    publicBaseUrl: "https://clearcut-api.lcl",
    webhookSecret: "test-secret",
    cloudflareBindingOrigin: "",
    cloudflareBindingNonce: "",
    ...overrides.config,
  };
  const { config: _configOverride, ...dependencyOverrides } = overrides;
  const dependencies: ApiDependencies = {
    repository,
    assetStore,
    config,
    jobRunner: { start: () => undefined },
    gemini: new FixtureGeminiClient(),
    parallel: new FixtureParallelClient(),
    monitors: new MemoryMonitorRepository(),
    events: new ProjectEventBus(),
    ...dependencyOverrides,
  };
  return { app: createApp(dependencies), repository, assetStore, root };
}
