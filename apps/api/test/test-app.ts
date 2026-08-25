import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApp, type ApiDependencies } from "../src/app";
import { FilesystemAssetStore } from "../src/repositories/filesystem-asset-store";
import { MemoryProjectRepository } from "../src/repositories/memory-project-repository";

export async function createTestApi(overrides: Partial<ApiDependencies> = {}) {
  const root = await mkdtemp(join(tmpdir(), "clearcut-api-"));
  const repository = new MemoryProjectRepository();
  const assetStore = new FilesystemAssetStore(root);
  const dependencies: ApiDependencies = {
    repository,
    assetStore,
    config: {
      host: "127.0.0.1",
      port: 3001,
      assetStorageDir: root,
      ffprobePath: "ffprobe",
      maxUploadBytes: 2_000_000,
      mockResearch: true,
      researchConcurrency: 4,
    },
    jobRunner: { start: () => undefined },
    ...overrides,
  };
  return { app: createApp(dependencies), repository, assetStore, root };
}
