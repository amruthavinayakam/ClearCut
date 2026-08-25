import type { AssetStore } from "./repositories/asset-store";
import type { ProjectRepository } from "./repositories/project-repository";
import type { ApiConfig } from "./config";

export type JobRunner = {
  start(projectId: string): void | Promise<void>;
  startRevision?(projectId: string, revisionId: string): void | Promise<void>;
};

export type ApiDependencies = {
  repository: ProjectRepository;
  assetStore: AssetStore;
  config: ApiConfig;
  jobRunner: JobRunner;
};

export type ClearCutVariables = {
  requestId: string;
};

export type ClearCutEnv = {
  Variables: ClearCutVariables;
};
