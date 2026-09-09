import { describe, expect, test } from "bun:test";

import fixture from "../../../fixtures/project-ready.json";
import { ApiErrorSchema, ProjectListSchema, ProjectSchema } from "@clearcut/contracts";
import { createTestApi } from "./test-app";

describe("project lifecycle", () => {
  test("real sample creates the official Artemis media pair through the standard project path", async () => {
    const { app, repository, assetStore } = await createTestApi({
      config: { maxUploadBytes: 20_000_000 },
    });
    const response = await app.request("/api/projects/sample", { method: "POST" });
    const project = ProjectSchema.parse(await response.json());
    const storedCut = await assetStore.stat(project.cut!.storage_key);

    expect(response.status).toBe(201);
    expect(project.title).toBe("Artemis I — Launch to the Moon");
    expect(project.script?.filename).toBe("artemis-i-recap.fountain");
    expect(project.cut?.filename).toBe("artemis-i-launch-recap.mp4");
    expect(project.cut?.duration_s).toBeGreaterThan(150);
    expect(project.cut?.duration_s).toBeLessThan(154);
    expect(storedCut.sizeBytes).toBeGreaterThan(12_000_000);
    expect((await repository.require(project.id)).cut?.storage_key).toBe(storedCut.key);
  });

  test("creation persists asset metadata before analysis starts", async () => {
    const { app, repository } = await createTestApi();
    const body = new FormData();
    body.set("title", "Night Drive");
    body.set("script", new File([
      "Title: Night Drive\n\nINT. CAR - NIGHT\nA radio plays under the dialogue.",
    ], "night-drive.fountain", { type: "text/plain" }));
    const response = await app.request("/api/projects", { method: "POST", body });
    const project = ProjectSchema.parse(await response.json());
    const persisted = await repository.require(project.id);

    expect(response.status).toBe(201);
    expect(persisted.phase).toBe("created");
    expect(persisted.script?.storage_key).toBeTruthy();
    expect(persisted.script_history.map((script) => script.id)).toEqual([persisted.script!.id]);
  });

  test("invalid project input returns ApiError without creating a project", async () => {
    const { app, repository } = await createTestApi();
    const body = new FormData();
    body.set("script", new File(["not a screenplay"], "malware.exe"));
    const response = await app.request("/api/projects", { method: "POST", body });

    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(await response.json()).code).toBe("unsupported_type");
    expect(await repository.list()).toHaveLength(0);
  });

  test("archive is reversible and active listing excludes archived projects", async () => {
    const { app, repository } = await createTestApi();
    await repository.save(ProjectSchema.parse(fixture));
    const archived = await app.request("/api/projects/proj_fixture", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    const active = ProjectListSchema.parse(await (await app.request("/api/projects")).json());
    const all = ProjectListSchema.parse(await (await app.request("/api/projects?include_archived=true")).json());
    const restored = await app.request("/api/projects/proj_fixture", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });

    expect(ProjectSchema.parse(await archived.json()).archived_at).not.toBeNull();
    expect(active.projects).toHaveLength(0);
    expect(all.projects.map((project) => project.id)).toEqual(["proj_fixture"]);
    expect(ProjectSchema.parse(await restored.json()).archived_at).toBeNull();
    expect((await repository.require("proj_fixture")).audit_events.slice(-2).map((event) => event.action)).toEqual([
      "project_archived",
      "project_restored",
    ]);
  });

  test("cut endpoint serves the persisted asset with byte ranges", async () => {
    const { app, repository, assetStore } = await createTestApi();
    const stored = await assetStore.put(new Blob(["0123456789"]).stream(), {
      key: "projects/range/cut.mp4",
      filename: "cut.mp4",
      contentType: "video/mp4",
      sizeBytes: 10,
    });
    await repository.save(ProjectSchema.parse({
      ...fixture,
      id: "proj_range",
      cut: { ...fixture.cut, storage_key: stored.key, size_bytes: 10 },
    }));
    const response = await app.request("/api/projects/proj_range/cut", {
      headers: { range: "bytes=2-5" },
    });

    expect(response.status).toBe(206);
    expect(await response.text()).toBe("2345");
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
  });

  test("completed direct uploads are scope and metadata checked before project creation", async () => {
    const { app, repository, assetStore } = await createTestApi();
    const projectId = "proj_direct";
    const blob = new Blob(["Title: Direct\n\nINT. ROOM - DAY\nA painting hangs."]);
    const stored = await assetStore.put(blob.stream(), {
      key: `uploads/${projectId}/script/opaque.fountain`,
      filename: "direct.fountain",
      contentType: "text/plain",
      sizeBytes: blob.size,
    });
    const create = (key = stored.key) => app.request("/api/projects/from-assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        title: "Direct",
        script_asset: {
          key,
          filename: stored.filename,
          content_type: stored.contentType,
          size_bytes: stored.sizeBytes,
          etag: stored.etag,
        },
        script_details: { title: "Direct", page_count: 1, scene_count: 1 },
      }),
    });
    const rejected = await create("uploads/another-project/script/opaque.fountain");
    const accepted = await create();

    expect(rejected.status).toBe(403);
    expect(accepted.status).toBe(201);
    expect((await repository.require(projectId)).script?.storage_key).toBe(stored.key);
  });

  test("rename records the previous title, and delete removes the record and its media", async () => {
    const { app, repository, assetStore } = await createTestApi();
    const project = ProjectSchema.parse(fixture);
    await repository.save(project);

    const renamed = await app.request(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Night Drive (Director's Cut)" }),
    });
    expect(renamed.status).toBe(200);
    const stored = await repository.require(project.id);
    expect(stored.title).toBe("Night Drive (Director's Cut)");
    // The old title has to survive: packets exported earlier carry it.
    const event = stored.audit_events.find((entry) => entry.action === "project_renamed");
    expect(event?.detail.previous_title).toBe("Night Drive");

    const removed = await app.request(`/api/projects/${project.id}`, { method: "DELETE" });
    expect(removed.status).toBe(204);
    expect(await repository.get(project.id)).toBeNull();
    // Media must not outlive the record that pointed at it.
    if (project.script) {
      await expect(assetStore.stat(project.script.storage_key)).rejects.toThrow();
    }
  });

  test("a patch with neither field is rejected", async () => {
    const { app, repository } = await createTestApi();
    await repository.save(ProjectSchema.parse(fixture));
    const response = await app.request("/api/projects/proj_fixture", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(422);
  });
});