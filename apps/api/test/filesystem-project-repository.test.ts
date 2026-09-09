import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ProjectSchema } from "@clearcut/contracts";

import fixture from "../../../fixtures/project-ready.json";
import { FilesystemProjectRepository } from "../src/repositories/filesystem-project-repository";

describe("filesystem project repository", () => {
  test("a production survives the process that created it", async () => {
    const directory = join(await mkdtemp(join(tmpdir(), "clearcut-store-")), "projects");
    const project = ProjectSchema.parse(fixture);

    await new FilesystemProjectRepository(directory).save(project);

    // A second instance over the same directory stands in for the restart that
    // used to empty the workspace.
    const restarted = new FilesystemProjectRepository(directory);
    expect((await restarted.require(project.id)).title).toBe(project.title);
    expect((await restarted.list()).map((entry) => entry.id)).toEqual([project.id]);

    await restarted.remove(project.id);
    expect(await new FilesystemProjectRepository(directory).get(project.id)).toBeNull();
  });
});
