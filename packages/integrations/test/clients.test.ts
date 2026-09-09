import { describe, expect, test } from "bun:test";

import type { ClearanceItem, Project } from "@clearcut/contracts";

import {
  FixtureGeminiClient,
  FixtureParallelClient,
  IntegrationOutputError,
  LiveGeminiClient,
  LiveParallelClient,
} from "../src";

const item = {
  id: "item_test",
  stable_item_id: "stable_test",
  name: "Test work",
  category: "artwork",
  description: "A test work",
  provenance: "script_only",
  source_version: "script-v1",
  script_references: [],
  cut_detections: [],
} as unknown as ClearanceItem;

describe("fixture integrations", () => {
  test("scans the Artemis real sample without mock-labeled findings", async () => {
    const gemini = new FixtureGeminiClient();
    const productionTitle = "Artemis I — Launch to the Moon";
    const script = await gemini.scanScreenplay({
      productionTitle,
      sourceVersion: "script-v1",
      scenes: [],
    });
    const cut = await gemini.scanCut({
      productionTitle,
      sourceVersion: "cut-v1",
      durationSeconds: 152,
      mimeType: "video/mp4",
      bytes: new Uint8Array(),
      screenplayDigest: "",
    });
    expect(script.candidates.map((candidate) => candidate.name)).toContain("NASA insignia");
    expect(cut.detections.map((detection) => detection.name)).toContain("NASA insignia");
    expect(cut.detections.every((detection) => detection.end_seconds <= 152)).toBe(true);
    expect([...script.candidates, ...cut.detections].every((candidate) => !candidate.name.includes("MOCK:"))).toBe(true);
  });

  test("researches Artemis sample cases from official public sources", async () => {
    const parallel = new FixtureParallelClient();
    const productionTitle = "Artemis I — Launch to the Moon";
    const sampleItem = { ...item, name: "NASA insignia", category: "brand" } as ClearanceItem;
    const sources = await parallel.searchClearanceItem(sampleItem, productionTitle, "project-artemis");
    const dossier = await parallel.buildDossier(sampleItem, productionTitle, sources);

    expect(sources.some((source) => new URL(source.url).hostname === "www.nasa.gov")).toBe(true);
    expect(dossier.research_summary).not.toContain("MOCK:");
    expect(dossier.licensing_routes.some((route) => route.contact?.includes("agency-brand@nasa.gov"))).toBe(true);
  });

  test("keeps verified research selected after screenplay title normalization", async () => {
    const parallel = new FixtureParallelClient();
    const sampleItem = { ...item, name: "NASA insignia", category: "brand" } as ClearanceItem;
    const sources = await parallel.searchClearanceItem(
      sampleItem,
      "ARTEMIS I — LAUNCH TO THE MOON",
      "project-artemis-uppercase",
    );

    expect(sources.some((source) => new URL(source.url).hostname === "www.nasa.gov")).toBe(true);
    expect(sources.every((source) => !source.title?.includes("MOCK:"))).toBe(true);
  });

  test("keeps sample copilot and monitoring grounded without mock labels", async () => {
    const gemini = new FixtureGeminiClient();
    const parallel = new FixtureParallelClient();
    const productionTitle = "Artemis I — Launch to the Moon";
    const project = { id: "project-artemis", title: productionTitle, items: [item] } as Project;
    const answer = await gemini.answerCopilot({ project, question: "What remains open?" });
    const monitor = await parallel.createMonitor(item, productionTitle, project.id, "daily");
    const events = await parallel.readMonitorEvents(monitor.monitor_id);

    expect(answer.answer).not.toContain("MOCK:");
    expect(monitor.query).not.toContain("MOCK:");
    expect(events.every((event) => !event.content?.includes("MOCK:"))).toBe(true);
  });

  test("clearly mark every human-facing result as mock data", async () => {
    const gemini = new FixtureGeminiClient();
    const parallel = new FixtureParallelClient();
    const script = await gemini.scanScreenplay({
      productionTitle: "Test",
      sourceVersion: "script-v1",
      scenes: [],
    });
    const cut = await gemini.scanCut({
      productionTitle: "Test",
      sourceVersion: "cut-v1",
      durationSeconds: 100,
      mimeType: "video/mp4",
      bytes: new Uint8Array(),
      screenplayDigest: "",
    });
    const sources = await parallel.searchClearanceItem(item, "Test", "project-test");
    const dossier = await parallel.buildDossier(item, "Test", sources);

    expect(script.candidates.every((candidate) => candidate.name.startsWith("MOCK:"))).toBe(true);
    expect(cut.detections.every((detection) => detection.name.startsWith("MOCK:"))).toBe(true);
    expect(sources.every((source) => source.title?.startsWith("MOCK:"))).toBe(true);
    expect(dossier.research_summary.startsWith("MOCK:")).toBe(true);
  });
});

describe("live integrations", () => {
  test("reject malformed Gemini structured output", async () => {
    const gemini = new LiveGeminiClient({
      apiKey: "test-key",
      request: async () => ({ candidates: [{ invented: true }] }),
    });
    await expect(gemini.scanScreenplay({
      productionTitle: "Test",
      sourceVersion: "script-v1",
      scenes: [],
    })).rejects.toBeInstanceOf(IntegrationOutputError);
  });

  test("never silently falls back to fixtures after a live Parallel failure", async () => {
    const parallel = new LiveParallelClient({
      apiKey: "test-key",
      request: async () => { throw new Error("provider down"); },
    });
    await expect(parallel.searchClearanceItem(item, "Test", "project-test"))
      .rejects.toThrow("provider down");
  });

  test("copilot receives project evidence but cannot mutate it", async () => {
    const gemini = new FixtureGeminiClient();
    const project = { id: "project", title: "Test", items: [item] } as Project;
    const before = structuredClone(project);
    const answer = await gemini.answerCopilot({ project, question: "Can I approve it?" });
    expect(answer.answer).toContain("cannot approve");
    expect(project).toEqual(before);
  });
});

describe("model throttling", () => {
  test("a rate-limited stage is retried rather than reported as a finding", async () => {
    let attempts = 0;
    const gemini = new LiveGeminiClient({
      apiKey: "test-key",
      // The retry schedule is real seconds; the behaviour under test is that it
      // retries at all, not how long it waits.
      retryBaseDelayMs: 0,
      request: async () => {
        attempts += 1;
        // Two 429s, exactly what a production's worth of cases hitting the
        // quota at once produces, then the real answer.
        if (attempts <= 2) throw new Error("Gemini rights_dossier_synthesist failed (429): Resource exhausted.");
        return { candidates: [{ content: { parts: [{ text: JSON.stringify({ candidates: [] }) }] } }] };
      },
    });

    const result = await gemini.scanScreenplay({ productionTitle: "Retry", sourceVersion: "script-v1", scenes: [] });

    expect(attempts).toBe(3);
    expect(result.candidates).toEqual([]);
  });

  test("a failure that is not throttling is surfaced immediately", async () => {
    let attempts = 0;
    const gemini = new LiveGeminiClient({
      apiKey: "test-key",
      request: async () => { attempts += 1; throw new Error("Gemini screenplay_scanner failed (400): malformed request"); },
    });

    await expect(gemini.scanScreenplay({ productionTitle: "No retry", sourceVersion: "script-v1", scenes: [] }))
      .rejects.toThrow(/400/);
    expect(attempts).toBe(1);
  });
});
