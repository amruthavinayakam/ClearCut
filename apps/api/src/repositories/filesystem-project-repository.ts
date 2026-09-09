import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ProjectSchema, type Project } from "@clearcut/contracts";

import { RepositoryError, type ProjectRepository } from "./project-repository";

/**
 * Productions on disk, one JSON document each.
 *
 * The in-memory repository loses every production the moment the process
 * restarts, and a dev server restarts constantly — on a file change, on a
 * crash, on a session teardown. That made local work feel like the data was
 * randomly vanishing. This keeps the same shape and semantics and simply
 * survives the process.
 */
export class FilesystemProjectRepository implements ProjectRepository {
  readonly #directory: string;
  readonly #cache = new Map<string, Project>();
  #loaded: Promise<void> | null = null;
  /** Writes are chained so two concurrent saves cannot interleave on one file. */
  #writes: Promise<unknown> = Promise.resolve();

  constructor(directory: string) {
    this.#directory = directory;
  }

  #path(id: string): string {
    return join(this.#directory, `${encodeURIComponent(id)}.json`);
  }

  #load(): Promise<void> {
    this.#loaded ??= (async () => {
      await mkdir(this.#directory, { recursive: true });
      for (const name of await readdir(this.#directory)) {
        if (!name.endsWith(".json")) continue;
        try {
          const parsed = ProjectSchema.parse(JSON.parse(await readFile(join(this.#directory, name), "utf8")));
          this.#cache.set(parsed.id, parsed);
        } catch {
          // A record written against an older contract must not stop the rest
          // of the productions from loading.
        }
      }
    })();
    return this.#loaded;
  }

  async list(options: { includeArchived?: boolean } = {}): Promise<Project[]> {
    await this.#load();
    return [...this.#cache.values()]
      .filter((project) => options.includeArchived || !project.archived_at)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
      .map((project) => structuredClone(project));
  }

  async get(id: string): Promise<Project | null> {
    await this.#load();
    const project = this.#cache.get(id);
    return project ? structuredClone(project) : null;
  }

  async require(id: string): Promise<Project> {
    const project = await this.get(id);
    if (!project) throw new RepositoryError("project_not_found", `Project not found: ${id}`);
    return project;
  }

  async save(project: Project): Promise<Project> {
    await this.#load();
    const validated = ProjectSchema.parse(project);
    this.#cache.set(validated.id, structuredClone(validated));
    // Written beside the target and renamed, so a process killed mid-write
    // leaves the previous record intact rather than a truncated one.
    const path = this.#path(validated.id);
    const staging = `${path}.${crypto.randomUUID()}.tmp`;
    this.#writes = this.#writes
      .then(() => writeFile(staging, JSON.stringify(validated), "utf8"))
      .then(() => rename(staging, path));
    await this.#writes;
    return structuredClone(validated);
  }

  async remove(id: string): Promise<void> {
    await this.#load();
    this.#cache.delete(id);
    this.#writes = this.#writes.then(() => rm(this.#path(id), { force: true }));
    await this.#writes;
  }
}
