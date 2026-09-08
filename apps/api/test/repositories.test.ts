import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import fixture from "../../../fixtures/project-ready.json";
import { ProjectSchema } from "@clearcut/contracts";
import { FilesystemAssetStore } from "../src/repositories/filesystem-asset-store";
import { MemoryProjectRepository } from "../src/repositories/memory-project-repository";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("local project repository", () => {
  test("round-trips validated projects without leaking mutable references", async () => {
    const repository = new MemoryProjectRepository();
    const project = ProjectSchema.parse(fixture);
    await repository.save(project);
    project.title = "Mutated caller";

    expect((await repository.require("proj_fixture")).title).toBe("Night Drive");
  });

  test("excludes archived projects unless explicitly requested", async () => {
    const repository = new MemoryProjectRepository();
    const archived = ProjectSchema.parse({ ...fixture, id: "archived", archived_at: "2026-08-24T14:00:00Z" });
    await repository.save(ProjectSchema.parse(fixture));
    await repository.save(archived);

    expect((await repository.list()).map((project) => project.id)).toEqual(["proj_fixture"]);
    expect((await repository.list({ includeArchived: true })).map((project) => project.id).sort()).toEqual(["archived", "proj_fixture"]);
  });
});

describe("filesystem asset store", () => {
  test("writes opaque keys and returns exact byte ranges", async () => {
    const root = await mkdtemp(join(tmpdir(), "clearcut-assets-"));
    roots.push(root);
    const store = new FilesystemAssetStore(root);
    const stored = await store.put(new Blob(["permission"]).stream(), {
      key: "projects/proj_fixture/documents/license.txt",
      filename: "license.txt",
      contentType: "text/plain",
      sizeBytes: 10,
    });

    const result = await store.read(stored.key, { start: 1, end: 4 });
    expect(await new Response(result.body).text()).toBe("ermi");
    expect(result.sizeBytes).toBe(4);
  });

  test("rejects a key that escapes the configured root", async () => {
    const root = await mkdtemp(join(tmpdir(), "clearcut-assets-"));
    roots.push(root);
    const store = new FilesystemAssetStore(root);

    await expect(store.read("../secret")).rejects.toThrow("invalid_asset_key");
  });
});
