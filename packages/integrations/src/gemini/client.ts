import type { Project } from "@clearcut/contracts";
import type { z } from "zod";

import {
  CopilotAnswerSchema,
  CutScanResultSchema,
  ReconciliationResultSchema,
  ScriptScanResultSchema,
  type CutScanInput,
  type GeminiClient,
  type ReconcileInput,
  type RequestFunction,
  type ReconciliationMatch,
  type ScriptScanInput,
  validateOutput,
} from "../types";

const GEMINI_SYSTEM = `You are a film-production clearance research assistant. Detect potentially
clearable elements and assemble evidence for human legal review. Never decide that an element is
cleared, approved, fair use, or legally safe. Unknown facts must remain unknown.`;

function projectContext(project: Project): string {
  return JSON.stringify({
    title: project.title,
    script: project.script?.label ?? null,
    cut: project.cut?.label ?? null,
    items: project.items.map((item) => ({
      name: item.name,
      category: item.category,
      provenance: item.provenance,
      status: item.workflow_status,
      rights_holders: item.candidate_rights_holders,
      evidence_gaps: item.evidence_gaps,
      recommended_actions: item.recommended_actions,
      sources: item.sources.map((source) => source.url),
    })),
  });
}

function textFromGemini(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("candidates" in value)) return value;
  const candidate = (value as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) return value;
  try { return JSON.parse(text); } catch { return value; }
}

export class FixtureGeminiClient implements GeminiClient {
  async scanScreenplay(_input: ScriptScanInput) {
    return ScriptScanResultSchema.parse(await Bun.file(
      new URL("../../../../fixtures/research/screenplay.json", import.meta.url),
    ).json());
  }

  async scanCut(_input: CutScanInput) {
    return CutScanResultSchema.parse(await Bun.file(
      new URL("../../../../fixtures/research/cut.json", import.meta.url),
    ).json());
  }

  async reconcile(input: ReconcileInput) {
    const unusedCut = new Set(input.cut.map((_, index) => index));
    const matches: ReconciliationMatch[] = input.script.map((script, scriptIndex) => {
      const exact = input.cut.findIndex((cut, index) => unusedCut.has(index) && cut.name === script.name);
      const category = input.cut.findIndex((cut, index) => unusedCut.has(index) && cut.category === script.category);
      const cutIndex = exact >= 0 ? exact : category;
      if (cutIndex < 0) {
        return {
          script_index: scriptIndex,
          cut_index: null,
          relationship: "script_only" as const,
          explanation: "MOCK: The scripted element was not detected in this rough cut.",
        };
      }
      unusedCut.delete(cutIndex);
      const relationship = exact >= 0 ? "in_both" as const : "materially_changed" as const;
      return {
        script_index: scriptIndex,
        cut_index: cutIndex,
        relationship,
        explanation: relationship === "in_both"
          ? "MOCK: The same named element appears on the page and on screen."
          : "MOCK: A generic scripted reference became a specific identifiable element on screen.",
      };
    });
    for (const cutIndex of unusedCut) {
      matches.push({
        script_index: null,
        cut_index: cutIndex,
        relationship: "cut_only",
        explanation: "MOCK: This element entered through the filmed material and was not in the screenplay.",
      });
    }
    return ReconciliationResultSchema.parse({ matches });
  }

  async answerCopilot(input: { project: Project; question: string }) {
    const asksForApproval = /approve|clear|sign[ -]?off|legal(?:ly)? safe/i.test(input.question);
    return CopilotAnswerSchema.parse({
      answer: asksForApproval
        ? "I cannot approve or clear an item. I can organize the evidence and gaps for the coordinator or counsel to review."
        : `MOCK: I found ${input.project.items.length} clearance case(s) in the current project evidence.`,
      citations: [],
    });
  }
}

export class LiveGeminiClient implements GeminiClient {
  readonly #request: RequestFunction;

  constructor(options: { apiKey: string; model?: string; request?: RequestFunction }) {
    if (!options.apiKey.trim()) throw new Error("GOOGLE_API_KEY is required for live Gemini mode.");
    const model = options.model ?? "gemini-2.5-flash";
    this.#request = options.request ?? (async (_operation, input) => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(options.apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      if (!response.ok) throw new Error(`Gemini request failed (${response.status}): ${await response.text()}`);
      return response.json();
    });
  }

  async #structured<T>(operation: string, prompt: string, schema: object, output: z.ZodType<T>, parts: unknown[] = []): Promise<T> {
    const raw = await this.#request(operation, {
      systemInstruction: { parts: [{ text: GEMINI_SYSTEM }] },
      contents: [{ role: "user", parts: [...parts, { text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    });
    return validateOutput("Gemini", output, textFromGemini(raw));
  }

  scanScreenplay(input: ScriptScanInput) {
    return this.#structured(
      "scan_screenplay",
      `Production: ${input.productionTitle}\nSource: ${input.sourceVersion}\nScenes:\n${JSON.stringify(input.scenes)}\nDetect all named or identifiable songs, brands, art, people, organizations, locations, quotations, archival material, products, and signage.`,
      ScriptScanResultSchema.toJSONSchema(),
      ScriptScanResultSchema,
    );
  }

  scanCut(input: CutScanInput) {
    if (input.bytes.byteLength > 18 * 1024 * 1024) {
      throw new Error("The cut exceeds Gemini inline media limits. Configure cloud media staging before live analysis.");
    }
    return this.#structured(
      "scan_cut",
      `Production: ${input.productionTitle}\nSource: ${input.sourceVersion}\nDuration: ${input.durationSeconds}s\nScreenplay digest: ${input.screenplayDigest}\nReport bounded second-based timecodes and prioritize unscripted elements.`,
      CutScanResultSchema.toJSONSchema(),
      CutScanResultSchema,
      [{ inlineData: { mimeType: input.mimeType, data: Buffer.from(input.bytes).toString("base64") } }],
    );
  }

  reconcile(input: ReconcileInput) {
    return this.#structured(
      "reconcile",
      `Reconcile these screenplay candidates and cut detections. Use every index once. A generic script reference paired with a specific cut work is materially_changed.\n${JSON.stringify(input)}`,
      ReconciliationResultSchema.toJSONSchema(),
      ReconciliationResultSchema,
    );
  }

  answerCopilot(input: { project: Project; question: string }) {
    return this.#structured(
      "copilot",
      `Answer the coordinator's question using only the evidence below. You cannot alter status or approve anything. If evidence is absent, say it is unknown.\nQUESTION: ${input.question}\nEVIDENCE: ${projectContext(input.project)}`,
      CopilotAnswerSchema.toJSONSchema(),
      CopilotAnswerSchema,
    );
  }
}
