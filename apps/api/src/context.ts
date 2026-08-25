import type { AssetStore } from "./repositories/asset-store";
import type { ProjectRepository } from "./repositories/project-repository";
import type { ApiConfig } from "./config";
import type { GeminiClient, ParallelClient } from "@clearcut/integrations";
import type { MonitorRepository } from "./repositories/monitor-repository";
import type { ProjectEventBus } from "./services/events";

export type JobRunner = {
  start(projectId: string): void | Promise<void>;
  startRevision?(projectId: string, revisionId: string): void | Promise<void>;
};

export type ApiDependencies = {
  repository: ProjectRepository;
  assetStore: AssetStore;
  config: ApiConfig;
  jobRunner: JobRunner;
  gemini: GeminiClient;
  parallel: ParallelClient;
  monitors: MonitorRepository;
  events: ProjectEventBus;
};

export type ClearCutVariables = {
  requestId: string;
};

export type ClearCutEnv = {
  Variables: ClearCutVariables;
};
