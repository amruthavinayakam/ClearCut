import { Firestore } from "@google-cloud/firestore";
import { ProjectSchema, type Project } from "@clearcut/contracts";

import { RepositoryError, type ProjectRepository } from "./project-repository";

/**
 * Durable project records for the Cloud Run deployment.
 *
 * The whole project is stored as one JSON string rather than a mapped document.
 * Firestore rejects nested arrays, and a Project is full of them (items hold
 * sources, which hold basis entries, which hold citations); the D1 adapter takes
 * the same approach for the same reason. The columns alongside it exist only so
 * a listing does not have to parse every record.
 */
export class FirestoreProjectRepository implements ProjectRepository {
  readonly #firestore: Firestore;
  readonly #collection: string;

  constructor(options: { projectId: string; collection?: string; databaseId?: string }) {
    this.#firestore = new Firestore({
      projectId: options.projectId,
      ...(options.databaseId ? { databaseId: options.databaseId } : {}),
      ignoreUndefinedProperties: true,
    });
    this.#collection = options.collection ?? "projects";
  }

  async list(options?: { includeArchived?: boolean }): Promise<Project[]> {
    const snapshot = await this.#firestore
      .collection(this.#collection)
      .orderBy("updated_at", "desc")
      .get();
    const projects = snapshot.docs
      .map((doc) => this.#parse(doc.get("data")))
      .filter((project): project is Project => project !== null);
    return options?.includeArchived
      ? projects
      : projects.filter((project) => project.archived_at === null);
  }

  async get(id: string): Promise<Project | null> {
    const doc = await this.#firestore.collection(this.#collection).doc(id).get();
    return doc.exists ? this.#parse(doc.get("data")) : null;
  }

  async require(id: string): Promise<Project> {
    const project = await this.get(id);
    if (!project) throw new RepositoryError("project_not_found", `Project not found: ${id}`);
    return project;
  }

  async save(project: Project): Promise<Project> {
    const parsed = ProjectSchema.parse(project);
    await this.#firestore.collection(this.#collection).doc(parsed.id).set({
      title: parsed.title,
      phase: parsed.phase,
      archived_at: parsed.archived_at,
      updated_at: parsed.updated_at,
      unresolved_count: parsed.items.filter((item) => !item.is_resolved).length,
      total_items: parsed.items.length,
      data: JSON.stringify(parsed),
    });
    return structuredClone(parsed);
  }

  async remove(id: string): Promise<void> {
    await this.#firestore.collection(this.#collection).doc(id).delete();
  }

  /** A record written by an older shape should not take down the whole listing. */
  #parse(raw: unknown): Project | null {
    if (typeof raw !== "string") return null;
    const parsed = ProjectSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }
}
