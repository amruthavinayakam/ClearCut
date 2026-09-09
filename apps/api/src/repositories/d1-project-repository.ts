import { ProjectSchema, type Project } from "@clearcut/contracts";

import { CloudflareBindingError, type CloudflareBindingClient } from "./cloudflare-binding-client";
import { RepositoryError, type ProjectRepository } from "./project-repository";

export class D1ProjectRepository implements ProjectRepository {
  constructor(readonly client: CloudflareBindingClient) {}

  async list(options: { includeArchived?: boolean } = {}): Promise<Project[]> {
    const rows = await this.client.json<unknown[]>(`/projects?include_archived=${options.includeArchived ? "true" : "false"}`);
    return rows.map((row) => ProjectSchema.parse(row));
  }

  async get(id: string): Promise<Project | null> {
    try {
      return ProjectSchema.parse(await this.client.json(`/projects/${encodeURIComponent(id)}`));
    } catch (error) {
      if (error instanceof CloudflareBindingError && error.status === 404) return null;
      throw error;
    }
  }

  async require(id: string): Promise<Project> {
    const project = await this.get(id);
    if (!project) throw new RepositoryError("project_not_found", `Project not found: ${id}`);
    return project;
  }

  async save(project: Project): Promise<Project> {
    const canonical = ProjectSchema.parse(project);
    const saved = await this.client.json("/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(canonical),
    });
    return ProjectSchema.parse(saved);
  }

  async remove(id: string): Promise<void> {
    await this.client.json(`/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}
