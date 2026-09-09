import { describe, expect, test } from "bun:test";

import { ProjectSchema } from "@clearcut/contracts";
import { FixtureGeminiClient, FixtureParallelClient } from "@clearcut/integrations";

import fixture from "../../../fixtures/project-ready.json";

import { ProjectOrchestrator } from "../src/pipeline/orchestrator";
import { researchStage } from "../src/pipeline/research-stage";
import { ProjectEventBus } from "../src/services/events";
import { createTestApi } from "./test-app";

describe("analysis orchestration", () => {
  test("persists every stage and retrieves with Parallel Search for each case", async () => {
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
      researchDepth: "fast",
      caseResearchTimeoutMs: null,
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
    // Retrieval is Parallel's; the dossier is reasoned from what it returned,
    // so the minutes-long Task run is not on the interactive path.
    for (const item of ready.items) {
      const calls = parallel.calls.filter((call) => call.itemId === item.id).map((call) => call.operation);
      expect(calls).toEqual(["search"]);
    }
  });

  test("deep research hands each case to a Parallel Task after the search", async () => {
    const { repository } = await createTestApi();
    const project = ProjectSchema.parse(fixture);
    project.items = [{ ...project.items[0], workflow_status: "detected", audit_events: [] }];
    await repository.save(project);
    const parallel = new FixtureParallelClient();

    await researchStage({
      project,
      repository,
      parallel,
      gemini: new FixtureGeminiClient(),
      events: new ProjectEventBus(),
      concurrency: 1,
      depth: "deep",
    });

    expect(parallel.calls.map((call) => call.operation)).toEqual(["search", "dossier"]);
  });

  test("a case whose research never returns becomes a gap instead of blocking the run", async () => {
    const { repository } = await createTestApi();
    const project = ProjectSchema.parse(fixture);
    project.items = [{ ...project.items[0], workflow_status: "detected", audit_events: [] }];
    await repository.save(project);

    // A dossier that never settles is the shape that held whole productions in
    // "analysing" while every other case had already finished.
    const parallel = new FixtureParallelClient();
    let cancelled = false;
    parallel.buildDossier = (_item, _title, _sources, signal) => new Promise<never>((_resolve, reject) => {
      signal?.addEventListener("abort", () => { cancelled = true; reject(new Error("aborted")); });
    });
    parallel.searchClearanceItem = async () => [];

    await researchStage({
      project,
      repository,
      parallel,
      gemini: new FixtureGeminiClient(),
      events: new ProjectEventBus(),
      concurrency: 1,
      depth: "deep",
      caseTimeoutMs: 40,
    });

    expect(project.items[0].workflow_status).toBe("unresolved");
    expect(project.items[0].research_error).toMatch(/time budget/i);
    // The expired run is cancelled, not left holding its connection.
    expect(cancelled).toBe(true);
  });

  test("fast research reasons over retrieved sources without a Parallel Task", async () => {
    const { repository } = await createTestApi();
    const project = ProjectSchema.parse(fixture);
    project.items = [{ ...project.items[0], workflow_status: "detected", audit_events: [], sources: [] }];
    await repository.save(project);

    const retrieved = {
      url: "https://example.gov/registry/entry",
      title: "Registry entry",
      excerpt: "The registry records the current administrator of record.",
      publish_date: null,
      retrieved_at: new Date().toISOString(),
      via: "parallel_search" as const,
      field: null,
    };
    const parallel = new FixtureParallelClient();
    parallel.searchClearanceItem = async () => [retrieved];
    // The Task API is the slow path; fast research must not reach for it.
    parallel.buildDossier = () => { throw new Error("Parallel Task must not run in fast research."); };

    const gemini = new FixtureGeminiClient();
    gemini.synthesizeDossier = async (input) => ({
      candidate_rights_holders: [],
      licensing_routes: [],
      research_summary: "Assembled from the retrieved registry entry.",
      evidence_gaps: [],
      unresolved_questions: [],
      recommended_actions: [],
      public_domain_status: "unknown",
      known_disputes: "none found",
      overall_confidence: "medium",
      // Index 0 is the retrieved source; index 9 does not exist.
      basis: [{ field: "administrator", reasoning: "Named in the registry.", confidence: "medium", source_indexes: [0, 9] }],
    });

    await researchStage({
      project,
      repository,
      parallel,
      gemini,
      events: new ProjectEventBus(),
      concurrency: 1,
      depth: "fast",
    });

    const item = project.items[0];
    expect(item.research_error).toBeFalsy();
    // Citations resolve to documents that were actually fetched, and an index
    // pointing at nothing is dropped rather than invented.
    expect(item.sources.map((source) => source.url)).toEqual([retrieved.url]);
    expect(item.task_run_id).toMatch(/^gemini-synthesis:/);
  });

  test("a production whose process died with its research finished is resumed, not re-run", async () => {
    const { repository, assetStore } = await createTestApi();
    const project = ProjectSchema.parse(fixture);
    // Exactly the shape a redeploy leaves behind: every case settled and saved,
    // but the phase never reached its terminal state.
    project.phase = "researching";
    project.items = project.items.map((item) => ({ ...item, workflow_status: "evidence_ready" as const }));
    await repository.save(project);

    const parallel = new FixtureParallelClient();
    const orchestrator = new ProjectOrchestrator({
      repository,
      assetStore,
      gemini: new FixtureGeminiClient(),
      parallel,
      events: new ProjectEventBus(),
      researchConcurrency: 2,
      researchDepth: "fast",
      caseResearchTimeoutMs: null,
    });

    expect(await orchestrator.recoverInterrupted()).toBe(1);

    const recovered = await repository.require(project.id);
    expect(recovered.phase).toBe("ready");
    // The evidence already gathered survives: nothing was researched again.
    expect(parallel.calls).toEqual([]);
    expect(recovered.items).toHaveLength(project.items.length);
  });

  test("a production interrupted mid-research finishes only the cases still owed one", async () => {
    const { repository, assetStore } = await createTestApi();
    const project = ProjectSchema.parse(fixture);
    project.phase = "researching";
    const [first] = project.items;
    project.items = [
      { ...first, id: "case_done", stable_item_id: "stable_done", workflow_status: "evidence_ready" },
      { ...first, id: "case_owed", stable_item_id: "stable_owed", workflow_status: "detected", audit_events: [] },
    ];
    await repository.save(project);

    const parallel = new FixtureParallelClient();
    await new ProjectOrchestrator({
      repository,
      assetStore,
      gemini: new FixtureGeminiClient(),
      parallel,
      events: new ProjectEventBus(),
      researchConcurrency: 2,
      researchDepth: "fast",
      caseResearchTimeoutMs: null,
    }).resume(project.id);

    expect((await repository.require(project.id)).phase).toBe("ready");
    expect(parallel.calls.map((call) => call.itemId)).toEqual(["case_owed"]);
  });
});
