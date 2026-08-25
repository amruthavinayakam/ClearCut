import { describe, expect, test } from "bun:test";

import { FixtureGeminiClient, FixtureParallelClient } from "@clearcut/integrations";

import { ProjectOrchestrator } from "../src/pipeline/orchestrator";
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
});
