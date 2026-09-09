import { describe, expect, test } from "bun:test";

import { ProjectSchema } from "@clearcut/contracts";
import { FixtureGeminiClient, FixtureParallelClient } from "@clearcut/integrations";

import fixture from "../../../fixtures/project-ready.json";

import { ProjectOrchestrator } from "../src/pipeline/orchestrator";
import { researchStage } from "../src/pipeline/research-stage";
import { ProjectEventBus } from "../src/services/events";
import { createTestApi } from "./test-app";

describe("analysis orchestration", () => {
  test("persists every stage and runs Search before Task for each case", async () => {
    const { repository, assetStore } = await createTestApi();
    const scriptBlob = new Blob(["Title: The Long Way Down\n\nINT. ROOM - NIGHT\nA song plays."]);
    const script = await assetStore.put(scriptBlob.stream(), {
      key: "projects/pipeline/script.fountain",
      filename: "script.fountain",
      contentType: "text/plain",
      sizeBytes: scriptBlob.size,
    });
    const cutBlob = new Blob(["fixture-video"]);
    const cut = await assetStore.put(cutBlob.stream(), {
      key: "projects/pipeline/cut.mp4",
      filename: "cut.mp4",
      contentType: "video/mp4",
      sizeBytes: cutBlob.size,
    });
    const { createProjectRecord } = await import("../src/services/projects");
    const project = createProjectRecord({
      id: "proj_pipeline",
      title: "The Long Way Down",
      scriptAsset: script,
      scriptDetails: { title: "The Long Way Down", page_count: 1, scene_count: 1 },
      cutAsset: cut,
      cutDetails: { duration_s: 94 },
    });
    await repository.save(project);
    const parallel = new FixtureParallelClient();
    const events = new ProjectEventBus();
    const orchestrator = new ProjectOrchestrator({
      repository,
      assetStore,
      gemini: new FixtureGeminiClient(),
      parallel,
      events,
      researchConcurrency: 2,
    });

    await orchestrator.run(project.id);
    const ready = await repository.require(project.id);
    const phases = ready.activity_events.map((event) => event.phase);

    expect(ready.phase).toBe("ready");
    expect(phases).toContain("scanning_script");
    expect(phases).toContain("scanning_cut");
    expect(phases).toContain("reconciling");
    expect(phases).toContain("researching");
    expect(ready.items.every((item) => item.workflow_status === "evidence_ready")).toBe(true);
    for (const item of ready.items) {
      const calls = parallel.calls.filter((call) => call.itemId === item.id).map((call) => call.operation);
      expect(calls).toEqual(["search", "dossier"]);
    }
  });

  test("a case whose research never returns becomes a gap instead of blocking the run", async () => {
    const { repository } = await createTestApi();
    const project = ProjectSchema.parse(fixture);
    project.items = [{ ...project.items[0], workflow_status: "detected", audit_events: [] }];
    await repository.save(project);

    // A dossier that never settles is the shape that held whole productions in
    // "analysing" while every other case had already finished.
    const parallel = new FixtureParallelClient();
    parallel.buildDossier = () => new Promise<never>(() => {});
    parallel.searchClearanceItem = async () => [];

    await researchStage({
      project,
      repository,
      parallel,
      events: new ProjectEventBus(),
      concurrency: 1,
      caseTimeoutMs: 40,
    });

    expect(project.items[0].workflow_status).toBe("unresolved");
    expect(project.items[0].research_error).toMatch(/time budget/i);
  });
});