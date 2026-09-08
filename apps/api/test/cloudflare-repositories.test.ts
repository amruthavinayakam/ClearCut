import { describe, expect, test } from "bun:test";

import fixture from "../../../fixtures/project-ready.json";
import { ProjectSchema } from "@clearcut/contracts";

import { CloudflareBindingClient } from "../src/repositories/cloudflare-binding-client";
import { D1ProjectRepository } from "../src/repositories/d1-project-repository";
import { R2AssetStore } from "../src/repositories/r2-asset-store";

function bridge() {
  const projects = new Map<string, unknown>();
  const assets = new Map<string, { bytes: Uint8Array; type: string }>();
  const requests: Request[] = [];
  const fetcher = async (request: Request) => {
    requests.push(request);
    const url = new URL(request.url);
    if (url.pathname === "/projects" && request.method === "POST") {
      const project = await request.json() as { id: string };
      projects.set(project.id, project);
      return Response.json(project);
    }
    if (url.pathname === "/projects" && request.method === "GET") return Response.json([...projects.values()]);
    if (url.pathname.startsWith("/projects/")) {
      const value = projects.get(decodeURIComponent(url.pathname.slice(10)));
      return value ? Response.json(value) : new Response(null, { status: 404 });
    }
    if (url.pathname.startsWith("/assets/")) {
      const key = decodeURIComponent(url.pathname.slice(8));
      if (request.method === "PUT") {
        assets.set(key, { bytes: new Uint8Array(await request.arrayBuffer()), type: request.headers.get("content-type") ?? "application/octet-stream" });
        return Response.json({ key, sizeBytes: assets.get(key)!.bytes.byteLength, contentType: assets.get(key)!.type, etag: "etag-1" });
      }
      const asset = assets.get(key);
      if (!asset) return new Response(null, { status: 404 });
      if (request.method === "HEAD") return new Response(null, { headers: { "content-length": String(asset.bytes.byteLength), "content-type": asset.type, etag: '"etag-1"' } });
      const range = request.headers.get("range");
      const match = range?.match(/^bytes=(\d+)-(\d+)$/);
      const start = match ? Number(match[1]) : 0;
      const end = match ? Number(match[2]) : asset.bytes.byteLength - 1;
      return new Response(asset.bytes.slice(start, end + 1), {
        status: match ? 206 : 200,
        headers: {
          "content-type": asset.type,
          "content-length": String(end - start + 1),
          ...(match ? { "content-range": `bytes ${start}-${end}/${asset.bytes.byteLength}` } : {}),
        },
      });
    }
    return new Response(null, { status: 404 });
  };
  return { client: new CloudflareBindingClient({ nonce: "nonce", fetcher }), requests };
}

describe("Cloudflare repository adapters", () => {
  test("D1 adapter round-trips canonical validated projects", async () => {
    const runtime = bridge();
    const repository = new D1ProjectRepository(runtime.client);
    const project = ProjectSchema.parse(fixture);
    await repository.save(project);
    const read = await repository.require(project.id);
    expect(read).toEqual(project);
    expect(read).not.toBe(project);
    expect((await repository.list()).map((candidate) => candidate.id)).toEqual([project.id]);
    expect(runtime.requests.every((request) => request.headers.get("x-clearcut-binding-nonce") === "nonce")).toBe(true);
  });

  test("R2 adapter preserves opaque keys and exact byte ranges", async () => {
    const runtime = bridge();
    const store = new R2AssetStore(runtime.client);
    await store.put(new Blob(["0123456789"]).stream(), {
      key: "projects/project-1/cut/file.mp4", filename: "file.mp4", contentType: "video/mp4", sizeBytes: 10,
    });
    const read = await store.read("projects/project-1/cut/file.mp4", { start: 2, end: 5 });
    expect(await new Response(read.body).text()).toBe("2345");
    expect(read.range).toEqual({ start: 2, end: 5 });
    expect(read.totalSizeBytes).toBe(10);
  });
});
