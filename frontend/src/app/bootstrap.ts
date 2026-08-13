import { api } from "../api/client";
import type { AppConfig, ProjectListItem } from "../types";


export type Resource<T> =
  | { status: "ready"; data: T }
  | { status: "error"; error: Error };

export interface BootResult {
  config: Resource<AppConfig>;
  projects: Resource<ProjectListItem[]>;
}

interface BootClient {
  config: () => Promise<AppConfig>;
  listProjects: (includeArchived?: boolean) => Promise<{ projects: ProjectListItem[] }>;
}

async function settle<T>(work: Promise<T>): Promise<Resource<T>> {
  try {
    return { status: "ready", data: await work };
  } catch (error) {
    return { status: "error", error: error as Error };
  }
}

export async function bootstrap(client: BootClient = api): Promise<BootResult> {
  const [config, projectResponse] = await Promise.all([
    settle(client.config()),
    settle(client.listProjects(true)),
  ]);
  return {
    config,
    projects:
      projectResponse.status === "ready"
        ? { status: "ready", data: projectResponse.data.projects }
        : projectResponse,
  };
}
