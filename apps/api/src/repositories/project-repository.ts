import type { Project } from "@clearcut/contracts";

export class RepositoryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

export interface ProjectRepository {
  list(options?: { includeArchived?: boolean }): Promise<Project[]>;
  get(id: string): Promise<Project | null>;
  require(id: string): Promise<Project>;
  save(project: Project): Promise<Project>;
  /** Removes the record permanently. Callers delete the media separately. */
  remove(id: string): Promise<void>;
}
