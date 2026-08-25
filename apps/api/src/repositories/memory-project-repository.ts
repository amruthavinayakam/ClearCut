import { ProjectSchema, type Project } from "@clearcut/contracts";

import { RepositoryError, type ProjectRepository } from "./project-repository";

export class MemoryProjectRepository implements ProjectRepository {
  readonly #projects = new Map<string, Project>();

  async list(options: { includeArchived?: boolean } = {}): Promise<Project[]> {
    return [...this.#projects.values()]
      .filter((project) => options.includeArchived || !project.archived_at)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
      .map((project) => structuredClone(project));
  }

  async get(id: string): Promise<Project | null> {
    const project = this.#projects.get(id);
    return project ? structuredClone(project) : null;
  }

  async require(id: string): Promise<Project> {
    const project = await this.get(id);
    if (!project) throw new RepositoryError("project_not_found", `Project not found: ${id}`);
    return project;
  }

  async save(project: Project): Promise<Project> {
    const validated = ProjectSchema.parse(project);
    this.#projects.set(validated.id, structuredClone(validated));
    return structuredClone(validated);
  }
}
