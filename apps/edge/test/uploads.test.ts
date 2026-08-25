import { describe, expect, test } from "bun:test";

import { UploadSessionService, type UploadSessionRecord } from "../src/uploads";

class Sessions {
  records = new Map<string, UploadSessionRecord>();
  async save(record: UploadSessionRecord) { this.records.set(record.session_id, structuredClone(record)); return record; }
  async get(id: string) { return structuredClone(this.records.get(id) ?? null); }
}

describe("direct R2 upload sessions", () => {
  test("generates an opaque scoped key and never accepts a caller bucket or key", async () => {
    const sessions = new Sessions();
    const service = new UploadSessionService({
      sessions,
      objects: { head: async () => null },
      signer: { signPut: async (key) => `https://r2.test/${key}?signed=1` },
      now: () => new Date("2026-08-24T12:00:00Z"),
    });
    const session = await service.create({
      project_id: "proj_1",
      kind: "cut",
      filename: "rough-cut.mp4",
      size_bytes: 25_000_000,
      content_type: "video/mp4",
    });
    expect(session.key).toMatch(/^uploads\/proj_1\/cut\/[a-f0-9-]+\.mp4$/);
    expect(session.upload_url).toContain(session.key);
    expect(JSON.stringify(session)).not.toContain("bucket");
  });

  test("checks expiry and object metadata, then finalizes idempotently", async () => {
    const sessions = new Sessions();
    let object: { size: number; contentType: string; etag: string } | null = null;
    const service = new UploadSessionService({
      sessions,
      objects: { head: async () => object },
      signer: { signPut: async (key) => `https://r2.test/${key}` },
      now: () => new Date("2026-08-24T12:00:00Z"),
    });
    const created = await service.create({
      project_id: "proj_1", kind: "script", filename: "draft.fountain",
      size_bytes: 120, content_type: "text/plain",
    });
    await expect(service.finalize(created.session_id)).rejects.toMatchObject({ code: "upload_missing" });
    object = { size: 120, contentType: "text/plain", etag: "etag-1" };
    const first = await service.finalize(created.session_id);
    const second = await service.finalize(created.session_id);
    expect(second).toEqual(first);
    expect(first.asset.key).toBe(created.key);

    const expired = await service.create({
      project_id: "proj_2", kind: "cut", filename: "cut.mp4", size_bytes: 10, content_type: "video/mp4",
    });
    sessions.records.get(expired.session_id)!.expires_at = "2026-08-24T11:59:59Z";
    await expect(service.finalize(expired.session_id)).rejects.toEqual(expect.objectContaining({ code: "upload_expired" }));
  });

  test("large objects use R2-compatible uniform multipart sizing", async () => {
    const service = new UploadSessionService({
      sessions: new Sessions(),
      objects: { head: async () => null },
      signer: { signPut: async (key) => `https://r2.test/${key}` },
    });
    const session = await service.create({
      project_id: "proj_1", kind: "cut", filename: "feature.mp4",
      size_bytes: 60 * 1024 * 1024 * 1024, content_type: "video/mp4",
    });
    expect(session.multipart?.part_size).toBeGreaterThanOrEqual(5 * 1024 * 1024);
    expect(session.multipart?.part_count).toBeLessThanOrEqual(10_000);
  });
});
