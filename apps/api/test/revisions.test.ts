import { describe, expect, test } from "bun:test";

import fixture from "../../../fixtures/project-ready.json";
import { ApiErrorSchema, ProjectRevisionSchema, ProjectSchema } from "@clearcut/contracts";
import { buildCandidateRevision, ensureInitialRevision } from "@clearcut/domain";
import { createTestApi } from "./test-app";

async function withCandidate() {
  const api = await createTestApi();
  const project = ProjectSchema.parse(fixture);
  const active = ensureInitialRevision(project);
  const candidateItem = structuredClone(project.items[0]);
  candidateItem.id = "item_candidate";
  const candidate = buildCandidateRevision(project, [candidateItem], { revisionId: "revision_candidate" });
  project.revisions.push(candidate);
  await api.repository.save(project);
  return { ...api, project, active, candidate };
}

describe("revision API", () => {
  test("list, detail, and repeated apply preserve idempotency", async () => {
    const { app, active, candidate } = await withCandidate();
    const list = await app.request("/api/projects/proj_fixture/revisions");
    const detail = await app.request(`/api/projects/proj_fixture/revisions/${candidate.id}`);
    const apply = () => app.request(`/api/projects/proj_fixture/revisions/${candidate.id}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ predecessor_id: active.id }),
    });
    const first = await apply();
    const second = await apply();

    expect((await list.json()).revisions).toHaveLength(2);
    expect(ProjectRevisionSchema.parse(await detail.json()).id).toBe(candidate.id);
    expect((await first.json()).already_applied).toBe(false);
    expect((await second.json()).already_applied).toBe(true);
  });

  test("stale predecessor rejects without mutating active items", async () => {
    const { app, repository, candidate, project } = await withCandidate();
    const before = structuredClone(project.items);
    const response = await app.request(`/api/projects/proj_fixture/revisions/${candidate.id}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ predecessor_id: "revision_from_another_tab" }),
    });

    expect(response.status).toBe(409);
    expect(ApiErrorSchema.parse(await response.json()).code).toBe("revision_conflict");
    expect((await repository.require("proj_fixture")).items).toEqual(before);
  });

  test("creation requires and persists a changed asset before comparison", async () => {
    const { app, repository } = await createTestApi();
    const project = ProjectSchema.parse(fixture);
    ensureInitialRevision(project);
    await repository.save(project);
    const missing = await app.request("/api/projects/proj_fixture/revisions", { method: "POST" });
    const body = new FormData();
    body.set("script", new File([
      "Title: Night Drive\n\nINT. CAR - NIGHT\nA revised scene.",
    ], "night-drive-v2.fountain", { type: "text/plain" }));
    const created = await app.request("/api/projects/proj_fixture/revisions", { method: "POST", body });
    const revision = ProjectRevisionSchema.parse(await created.json());

    expect(missing.status).toBe(400);
    expect(revision.state).toBe("processing");
    expect(revision.script?.label).toBe("script-v2");
    expect((await repository.require("proj_fixture")).revisions.at(-1)?.id).toBe(revision.id);
  });
});
