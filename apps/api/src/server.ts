import { createApp } from "./app";
import { readConfig } from "./config";
import { FilesystemAssetStore } from "./repositories/filesystem-asset-store";
import { MemoryProjectRepository } from "./repositories/memory-project-repository";

const config = readConfig();
const app = createApp({
  config,
  repository: new MemoryProjectRepository(),
  assetStore: new FilesystemAssetStore(config.assetStorageDir),
  jobRunner: { start: () => undefined },
});

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch: app.fetch,
});

console.log(`ClearCut API listening on ${server.url}`);
