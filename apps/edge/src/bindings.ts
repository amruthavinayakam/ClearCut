import { ProjectSchema, type Project } from "@clearcut/contracts";

import { EdgeProblem, problemResponse } from "./errors";
import type { UploadSessionRecord, UploadSessionStore } from "./uploads";

export type BindingEnv = {
  DB: D1Database;
  ASSETS: R2Bucket;
  BINDING_NONCE: string;
};

async function secureEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < av.length; index += 1) difference |= av[index] ^ bv[index];
  return difference === 0;
}

function keyFrom(pathname: string): string {
  const key = decodeURIComponent(pathname.slice("/assets/".length));
  if (!key || key.startsWith("/") || key.includes("..")) throw new EdgeProblem(400, "invalid_asset_key", "Invalid asset key.");
  return key;
}

function parseRange(value: string | null, size: number): { offset: number; length: number } | null {
  if (!value) return null;
  const match = value.match(/^bytes=(\d+)-(\d+)$/);
  if (!match) throw new EdgeProblem(416, "invalid_asset_range", "Invalid byte range.");
  const start = Number(match[1]);
  const end = Math.min(Number(match[2]), size - 1);
  if (start > end || start >= size) throw new EdgeProblem(416, "invalid_asset_range", "Invalid byte range.");
  return { offset: start, length: end - start + 1 };
}

async function projects(request: Request, env: BindingEnv, url: URL): Promise<Response> {
  if (url.pathname === "/projects" && request.method === "POST") {
    const project = ProjectSchema.parse(await request.json());
    await env.DB.prepare(`
      INSERT INTO projects (id, title, phase, archived_at, updated_at, unresolved_count, total_items, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        phase = excluded.phase,
        archived_at = excluded.archived_at,
        updated_at = excluded.updated_at,
        unresolved_count = excluded.unresolved_count,
        total_items = excluded.total_items,
        data = excluded.data
    `).bind(
      project.id,
      project.title,
      project.phase,
      project.archived_at,
      project.updated_at,
      project.items.filter((item) => !item.is_resolved).length,
      project.items.length,
      JSON.stringify(project),
    ).run();
    return Response.json(project);
  }
  if (url.pathname === "/projects" && request.method === "GET") {
    const includeArchived = url.searchParams.get("include_archived") === "true";
    const result = await env.DB.prepare(
      `SELECT data FROM projects ${includeArchived ? "" : "WHERE archived_at IS NULL"} ORDER BY updated_at DESC`,
    ).all<{ data: string }>();
    return Response.json(result.results.map((row) => ProjectSchema.parse(JSON.parse(row.data))));
  }
  if (url.pathname.startsWith("/projects/") && request.method === "GET") {
    const id = decodeURIComponent(url.pathname.slice("/projects/".length));
    const row = await env.DB.prepare("SELECT data FROM projects WHERE id = ?").bind(id).first<{ data: string }>();
    return row ? Response.json(ProjectSchema.parse(JSON.parse(row.data))) : new Response(null, { status: 404 });
  }
  throw new EdgeProblem(404, "binding_operation_not_found", "Binding operation not found.");
}

async function assets(request: Request, env: BindingEnv, url: URL): Promise<Response> {
  const key = keyFrom(url.pathname);
  if (request.method === "PUT") {
    if (!request.body) throw new EdgeProblem(400, "asset_body_required", "Asset body is required.");
    const object = await env.ASSETS.put(key, request.body, {
      httpMetadata: { contentType: request.headers.get("content-type") ?? "application/octet-stream" },
      customMetadata: { filename: request.headers.get("x-clearcut-filename") ?? "" },
    });
    if (!object) throw new EdgeProblem(409, "asset_write_failed", "R2 rejected the asset write.");
    return Response.json({
      key,
      filename: decodeURIComponent(object.customMetadata?.filename ?? ""),
      contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
      sizeBytes: object.size,
      etag: object.etag,
    });
  }
  if (request.method === "DELETE") {
    await env.ASSETS.delete(key);
    return new Response(null, { status: 204 });
  }
  const head = await env.ASSETS.head(key);
  if (!head) return new Response(null, { status: 404 });
  const headers = new Headers({
    "content-type": head.httpMetadata?.contentType ?? "application/octet-stream",
    "content-length": String(head.size),
    etag: head.httpEtag,
    "x-clearcut-filename": head.customMetadata?.filename ?? "",
  });
  if (request.method === "HEAD") return new Response(null, { headers });
  if (request.method !== "GET") throw new EdgeProblem(405, "method_not_allowed", "Method not allowed.");
  const range = parseRange(request.headers.get("range"), head.size);
  const object = await env.ASSETS.get(key, range ? { range } : undefined);
  if (!object || !("body" in object)) return new Response(null, { status: 404 });
  if (range) {
    headers.set("content-length", String(range.length));
    headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
  }
  return new Response(object.body, { status: range ? 206 : 200, headers });
}

export async function handleBindingRequest(request: Request, env: BindingEnv): Promise<Response> {
  try {
    if (!await secureEqual(request.headers.get("x-clearcut-binding-nonce") ?? "", env.BINDING_NONCE)) {
      throw new EdgeProblem(401, "invalid_binding_nonce", "Invalid binding nonce.");
    }
    const url = new URL(request.url);
    if (url.pathname === "/projects" || url.pathname.startsWith("/projects/")) return projects(request, env, url);
    if (url.pathname.startsWith("/assets/")) return assets(request, env, url);
    throw new EdgeProblem(404, "binding_operation_not_found", "Binding operation not found.");
  } catch (error) {
    return problemResponse(error);
  }
}

export class D1UploadSessionStore implements UploadSessionStore {
  constructor(readonly db: D1Database) {}

  async save(record: UploadSessionRecord): Promise<UploadSessionRecord> {
    await this.db.prepare(`
      INSERT INTO upload_sessions
        (session_id, project_id, kind, key, filename, size_bytes, content_type, expires_at, completed_at, etag, multipart_upload_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        completed_at = excluded.completed_at,
        etag = excluded.etag,
        multipart_upload_id = excluded.multipart_upload_id
    `).bind(
      record.session_id, record.project_id, record.kind, record.key, record.filename,
      record.size_bytes, record.content_type, record.expires_at, record.completed_at,
      record.etag, record.multipart_upload_id,
    ).run();
    return record;
  }

  async get(sessionId: string): Promise<UploadSessionRecord | null> {
    return this.db.prepare("SELECT * FROM upload_sessions WHERE session_id = ?")
      .bind(sessionId).first<UploadSessionRecord>();
  }
}

export class R2UploadObjectStore {
  constructor(readonly bucket: R2Bucket) {}

  async head(key: string) {
    const object = await this.bucket.head(key);
    return object ? {
      size: object.size,
      contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
      etag: object.etag,
    } : null;
  }
}
