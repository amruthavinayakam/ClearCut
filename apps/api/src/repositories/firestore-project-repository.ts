import { Firestore } from "@google-cloud/firestore";
import { gunzipSync, gzipSync } from "node:zlib";
import { ProjectSchema, type Project } from "@clearcut/contracts";

import type { AssetStore } from "./asset-store";
import { RepositoryError, type ProjectRepository } from "./project-repository";

/**
 * Durable project records for the Cloud Run deployment.
 *
 * The record itself lives in the object store; Firestore holds only an index.
 * A document there is capped at about a mebibyte, and a real production passes
 * it — one with 73 cases and 557 citations measured 1,809,126 bytes — at which
 * point every save is rejected with INVALID_ARGUMENT. Nobody ever sees that
 * error: the run finishes, the terminal write fails, and the production sits in
 * "analysing" for good. A clearance record grows with the evidence gathered for
 * it, so any fixed ceiling in the low megabytes is the wrong shape for this
 * data. Objects have no such limit.
 *
 * Firestore still earns its place: listing productions needs them ordered by
 * when they last changed, which an object store cannot answer without reading
 * every record. So the index is queried and only the records it names are read.
 *
 * The blob is gzipped — research text compresses about four to one, and this is
 * on the path of every stage transition.
 */
export class FirestoreProjectRepository implements ProjectRepository {
  readonly #firestore: Firestore;
  readonly #collection: string;
  readonly #blobs: AssetStore | null;

  constructor(options: { projectId: string; collection?: string; databaseId?: string; blobs?: AssetStore }) {
    this.#firestore = new Firestore({
      projectId: options.projectId,
      ...(options.databaseId ? { databaseId: options.databaseId } : {}),
      ignoreUndefinedProperties: true,
    });
    this.#collection = options.collection ?? "projects";
    this.#blobs = options.blobs ?? null;
  }

  #key(id: string): string {
    return `projects/${id}.json.gz`;
  }

  async list(options?: { includeArchived?: boolean }): Promise<Project[]> {
    const snapshot = await this.#firestore
      .collection(this.#collection)
      .orderBy("updated_at", "desc")
      .get();
    const projects = (await Promise.all(snapshot.docs.map((doc) => this.#load(doc.id, doc.get("data")))))
      .filter((project): project is Project => project !== null);
    return options?.includeArchived
      ? projects
      : projects.filter((project) => project.archived_at === null);
  }

  async get(id: string): Promise<Project | null> {
    const doc = await this.#firestore.collection(this.#collection).doc(id).get();
    return doc.exists ? this.#load(id, doc.get("data")) : null;
  }

  async require(id: string): Promise<Project> {
    const project = await this.get(id);
    if (!project) throw new RepositoryError("project_not_found", `Project not found: ${id}`);
    return project;
  }

  async save(project: Project): Promise<Project> {
    const parsed = ProjectSchema.parse(project);
    const blob = gzipSync(Buffer.from(JSON.stringify(parsed), "utf8"));
    const index = {
      title: parsed.title,
      phase: parsed.phase,
      archived_at: parsed.archived_at,
      updated_at: parsed.updated_at,
      unresolved_count: parsed.items.filter((item) => !item.is_resolved).length,
      total_items: parsed.items.length,
    };

    if (this.#blobs) {
      // The record first, then the index that points at it: an index entry
      // naming a record that was never written is the one ordering that loses
      // data rather than merely repeating work.
      await this.#blobs.put(new Blob([blob as unknown as BlobPart]).stream(), {
        key: this.#key(parsed.id),
        filename: `${parsed.id}.json.gz`,
        contentType: "application/gzip",
        sizeBytes: blob.byteLength,
      });
      await this.#firestore.collection(this.#collection).doc(parsed.id).set(index);
    } else {
      await this.#firestore.collection(this.#collection).doc(parsed.id).set({ ...index, data: blob });
    }
    return structuredClone(parsed);
  }

  async remove(id: string): Promise<void> {
    await this.#firestore.collection(this.#collection).doc(id).delete();
    // A leftover object is harmless; a delete that fails on it is not a reason
    // to leave the record listed.
    await this.#blobs?.delete(this.#key(id)).catch(() => undefined);
  }

  /**
   * Reads a record, preferring the object store and falling back to the
   * document, so records written before the blob moved out still load.
   */
  async #load(id: string, inline: unknown): Promise<Project | null> {
    if (this.#blobs) {
      const stored = await this.#readBlob(id);
      if (stored) return stored;
    }
    return this.#parse(inline);
  }

  async #readBlob(id: string): Promise<Project | null> {
    try {
      const read = await this.#blobs!.read(this.#key(id));
      const bytes = new Uint8Array(await new Response(read.body).arrayBuffer());
      return this.#parse(bytes);
    } catch {
      // Not written yet, or written before the move. The caller falls back.
      return null;
    }
  }

  /** A record written by an older shape should not take down the whole listing. */
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
