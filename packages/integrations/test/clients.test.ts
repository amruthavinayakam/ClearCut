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
