import { EdgeProblem } from "./errors";

export type UploadKind = "script" | "cut" | "document";
export type UploadSessionRecord = {
  session_id: string;
  project_id: string;
  kind: UploadKind;
  key: string;
  filename: string;
  size_bytes: number;
  content_type: string;
  expires_at: string;
  completed_at: string | null;
  etag: string | null;
  multipart_upload_id: string | null;
};

export type UploadSessionStore = {
  save(record: UploadSessionRecord): Promise<UploadSessionRecord>;
  get(sessionId: string): Promise<UploadSessionRecord | null>;
};

export type UploadObjectHead = { size: number; contentType: string; etag: string };
export type UploadObjectStore = { head(key: string): Promise<UploadObjectHead | null> };
export type UploadSigner = {
  signPut(key: string, options: { contentType: string; expiresInSeconds: number }): Promise<string>;
  createMultipart?(key: string, options: { contentType: string; partCount: number; partSize: number; expiresInSeconds: number }): Promise<{
    uploadId: string;
    parts: Array<{ part_number: number; upload_url: string }>;
  }>;
  completeMultipart?(key: string, uploadId: string, parts: Array<{ part_number: number; etag: string }>): Promise<void>;
};

export class UploadProblem extends EdgeProblem {}

const MIN_PART = 5 * 1024 * 1024;
const TARGET_PART = 32 * 1024 * 1024;
const SINGLE_LIMIT = 100 * 1024 * 1024;

function extension(filename: string): string {
  const match = filename.toLocaleLowerCase().match(/\.[a-z0-9]{1,10}$/);
  return match?.[0] ?? "";
}

function multipartSizing(size: number) {
  const minimumForLimit = Math.ceil(size / 10_000 / MIN_PART) * MIN_PART;
  const partSize = Math.max(MIN_PART, TARGET_PART, minimumForLimit);
  return { part_size: partSize, part_count: Math.ceil(size / partSize) };
}

export class UploadSessionService {
  readonly #sessions: UploadSessionStore;
  readonly #objects: UploadObjectStore;
  readonly #signer: UploadSigner;
  readonly #now: () => Date;
  readonly #ttlSeconds: number;

  constructor(input: {
    sessions: UploadSessionStore;
    objects: UploadObjectStore;
    signer: UploadSigner;
    now?: () => Date;
    ttlSeconds?: number;
  }) {
    this.#sessions = input.sessions;
    this.#objects = input.objects;
    this.#signer = input.signer;
    this.#now = input.now ?? (() => new Date());
    this.#ttlSeconds = input.ttlSeconds ?? 15 * 60;
  }

  async create(input: {
    project_id: string;
    kind: UploadKind;
    filename: string;
    size_bytes: number;
    content_type: string;
  }) {
    if (!input.project_id.trim() || !input.filename.trim() || !Number.isSafeInteger(input.size_bytes) || input.size_bytes <= 0) {
      throw new UploadProblem(422, "invalid_upload", "Upload metadata is incomplete.");
    }
    const sessionId = `upload_${crypto.randomUUID()}`;
    const key = `uploads/${input.project_id}/${input.kind}/${crypto.randomUUID()}${extension(input.filename)}`;
    const expiresAt = new Date(this.#now().getTime() + this.#ttlSeconds * 1_000).toISOString();
    const record: UploadSessionRecord = {
      session_id: sessionId,
      project_id: input.project_id,
      kind: input.kind,
      key,
      filename: input.filename,
      size_bytes: input.size_bytes,
      content_type: input.content_type || "application/octet-stream",
      expires_at: expiresAt,
      completed_at: null,
      etag: null,
      multipart_upload_id: null,
    };

    let uploadUrl: string | null = null;
    let multipart: null | {
      upload_id: string | null;
      part_size: number;
      part_count: number;
      parts: Array<{ part_number: number; upload_url: string }>;
    } = null;
    if (input.size_bytes <= SINGLE_LIMIT) {
      uploadUrl = await this.#signer.signPut(key, { contentType: record.content_type, expiresInSeconds: this.#ttlSeconds });
    } else {
      const size = multipartSizing(input.size_bytes);
      const initialized = this.#signer.createMultipart
        ? await this.#signer.createMultipart(key, { contentType: record.content_type, partCount: size.part_count, partSize: size.part_size, expiresInSeconds: this.#ttlSeconds })
        : null;
      record.multipart_upload_id = initialized?.uploadId ?? null;
      multipart = {
        upload_id: initialized?.uploadId ?? null,
        part_size: size.part_size,
        part_count: size.part_count,
        parts: initialized?.parts ?? [],
      };
    }
    await this.#sessions.save(record);
    return { ...record, upload_url: uploadUrl, multipart };
  }

  async finalize(sessionId: string, parts: Array<{ part_number: number; etag: string }> = []) {
    const session = await this.#sessions.get(sessionId);
    if (!session) throw new UploadProblem(404, "upload_session_not_found", "Upload session not found.");
    if (session.completed_at) {
      return { session_id: session.session_id, completed_at: session.completed_at, asset: this.#asset(session) };
    }
    if (new Date(session.expires_at).getTime() <= this.#now().getTime()) {
      throw new UploadProblem(410, "upload_expired", "The upload session has expired.");
    }
    if (session.multipart_upload_id && this.#signer.completeMultipart) {
      if (parts.length === 0) throw new UploadProblem(422, "multipart_parts_required", "Completed multipart parts are required.");
      await this.#signer.completeMultipart(session.key, session.multipart_upload_id, parts);
    }
    const object = await this.#objects.head(session.key);
    if (!object) throw new UploadProblem(409, "upload_missing", "The uploaded object is not available yet.");
    if (object.size !== session.size_bytes || object.contentType !== session.content_type) {
      throw new UploadProblem(409, "upload_metadata_mismatch", "The uploaded object does not match the scoped session.");
    }
    session.completed_at = this.#now().toISOString();
    session.etag = object.etag;
    await this.#sessions.save(session);
    return { session_id: session.session_id, completed_at: session.completed_at, asset: this.#asset(session) };
  }

  #asset(session: UploadSessionRecord) {
    return {
      key: session.key,
      filename: session.filename,
      content_type: session.content_type,
      size_bytes: session.size_bytes,
      etag: session.etag,
    };
  }
}
