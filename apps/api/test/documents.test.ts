import { describe, expect, test } from "bun:test";

import fixture from "../../../fixtures/project-ready.json";
import { ApiErrorSchema, ProjectSchema } from "@clearcut/contracts";
import { createTestApi } from "./test-app";

async function seeded() {
  const api = await createTestApi();
  const project = ProjectSchema.parse({
    ...fixture,
    items: [
      fixture.items[0],
      { ...fixture.items[0], id: "item_music", stable_item_id: "stable_music", name: "Midnight Orchard", category: "music" },
    ],
  });
  await api.repository.save(project);
  return api;
}

async function attach(app: Awaited<ReturnType<typeof createTestApi>>["app"], itemId = "item_brand") {
  const body = new FormData();
  body.set("file", new File(["permission"], "license.pdf", { type: "application/pdf" }));
  body.set("kind", "license");
  body.set("title", "Artwork licence");
  body.set("media", "theatrical,streaming");
  body.set("territories", "US,CA");
  body.set("perpetual", "true");
  body.set("attached_by", "Mara Chen");
  return app.request(`/api/projects/proj_fixture/items/${itemId}/documents`, { method: "POST", body });
}

describe("production documents", () => {
  test("upload, download, metadata patch, and delete preserve ownership", async () => {
    const { app } = await seeded();
    const uploaded = await attach(app);
    const payload = await uploaded.json();
    const documentId = payload.document.id as string;
    const downloaded = await app.request(`/api/projects/proj_fixture/items/item_brand/documents/${documentId}`);
    const downloadedText = await downloaded.text();
    const patched = await app.request(`/api/projects/proj_fixture/items/item_brand/documents/${documentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: "Countersigned copy", territories: ["US"] }),
    });
    const wrongOwner = await app.request(`/api/projects/proj_fixture/items/item_music/documents/${documentId}`);
    const deleted = await app.request(`/api/projects/proj_fixture/items/item_brand/documents/${documentId}`, { method: "DELETE" });

    expect(uploaded.status).toBe(200);
    expect(downloadedText).toBe("permission");
    expect((await patched.json()).document.notes).toBe("Countersigned copy");
    expect(wrongOwner.status).toBe(404);
    expect(deleted.status).toBe(204);
  });

  test("documented permission requires a document attached to the same case", async () => {
    const { app } = await seeded();
    const otherDocument = (await (await attach(app, "item_music")).json()).document;
    const response = await app.request("/api/projects/proj_fixture/items/item_brand/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "documented_permission",
        actor: "coordinator",
        rationale: "Permission is recorded.",
        document_ids: [otherDocument.id],
      }),
    });

    expect(response.status).toBe(422);
    expect(ApiErrorSchema.parse(await response.json()).code).toBe("supporting_document_required");
  });
});
