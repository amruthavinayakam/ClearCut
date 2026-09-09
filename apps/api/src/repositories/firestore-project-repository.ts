import { Firestore } from "@google-cloud/firestore";
import { gunzipSync, gzipSync } from "node:zlib";
import { ProjectSchema, type Project } from "@clearcut/contracts";

import { RepositoryError, type ProjectRepository } from "./project-repository";

/**
 * Durable project records for the Cloud Run deployment.
 *
 * The whole project is stored as one blob rather than a mapped document.
 * Firestore rejects nested arrays, and a Project is full of them (items hold
 * sources, which hold basis entries, which hold citations); the D1 adapter takes
 * the same approach for the same reason. The columns alongside it exist only so
 * a listing does not have to parse every record.
 *
 * The blob is gzipped. Firestore caps a document at about a mebibyte, and the
 * JSON passes that on a real production: one with 73 cases and 557 citations
 * measured 1,809,126 bytes, 1.73x the limit, so *every* save was rejected with
 * INVALID_ARGUMENT. The reader never sees that error — the run finishes, the
 * final write fails, and the production sits in "analysing" for good. Gzipped,
 * that same record is 482,334 bytes, 0.46x the limit.
 *
 * That is a reprieve rather than a fix: 3.8x compression on this data means a
 * production about twice the size of the largest one seen will hit the ceiling
 * again. The durable answer is to keep the blob in the bucket that already
 * holds the media and leave only the index in Firestore.
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
      data: gzipSync(Buffer.from(JSON.stringify(parsed), "utf8")),
    });
    return structuredClone(parsed);
  }

  async remove(id: string): Promise<void> {
    await this.#firestore.collection(this.#collection).doc(id).delete();
  }

  /**
   * A record written by an older shape should not take down the whole listing.
   *
   * Records written before the blob was compressed are still plain JSON
   * strings, so both are read.
   */
  #parse(raw: unknown): Project | null {
    let json: string;
    if (typeof raw === "string") json = raw;
    else if (raw instanceof Uint8Array) json = gunzipSync(raw).toString("utf8");
    else if (raw && typeof raw === "object" && "toUint8Array" in raw) {
      json = gunzipSync((raw as { toUint8Array(): Uint8Array }).toUint8Array()).toString("utf8");
    } else return null;
    try {
      const parsed = ProjectSchema.safeParse(JSON.parse(json));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}
