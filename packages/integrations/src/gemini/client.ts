import type { Project } from "@clearcut/contracts";
import {
  Gemini,
  InMemorySessionService,
  LlmAgent,
  Runner,
  type LlmAgentSchema,
} from "@google/adk";
import {
  GoogleGenAI,
  createPartFromBase64,
  createPartFromUri,
  createUserContent,
  type PartUnion,
} from "@google/genai";
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
import { isVerifiedSample } from "../sample";

const GEMINI_SYSTEM = `You are a film-production clearance research assistant. Detect potentially
clearable elements and assemble evidence for human legal review. Never decide that an element is
cleared, approved, fair use, or legally safe. Unknown facts must remain unknown.`;

/** ADK session identity. One app, one non-human actor: the research agent. */
const ADK_APP_NAME = "clearcut";
const ADK_USER_ID = "clearcut-agent";

/** Above this, a cut is staged through the Gemini Files API instead of the request body. */
const INLINE_MEDIA_LIMIT_BYTES = 18 * 1024 * 1024;
const FILE_PROCESSING_TIMEOUT_MS = 10 * 60_000;

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
  async scanScreenplay(input: ScriptScanInput) {
    return ScriptScanResultSchema.parse(await Bun.file(
      new URL(
        isVerifiedSample(input.productionTitle)
          ? "../../../../fixtures/research/artemis/screenplay.json"
          : "../../../../fixtures/research/screenplay.json",
        import.meta.url,
      ),
    ).json());
  }

  async scanCut(input: CutScanInput) {
    return CutScanResultSchema.parse(await Bun.file(
      new URL(
        isVerifiedSample(input.productionTitle)
          ? "../../../../fixtures/research/artemis/cut.json"
          : "../../../../fixtures/research/cut.json",
        import.meta.url,
      ),
    ).json());
  }

  async reconcile(input: ReconcileInput) {
    const verified = isVerifiedSample(input.productionTitle);
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
          explanation: verified
            ? "The scripted element was not observed in the supplied rough cut."
            : "MOCK: The scripted element was not detected in this rough cut.",
        };
      }
      unusedCut.delete(cutIndex);
      const relationship = exact >= 0 ? "in_both" as const : "materially_changed" as const;
      return {
        script_index: scriptIndex,
        cut_index: cutIndex,
        relationship,
        explanation: relationship === "in_both"
          ? verified
            ? "The same identified element appears in the documentary script and the supplied picture."
            : "MOCK: The same named element appears on the page and on screen."
          : verified
            ? "A generic scripted reference resolves to a more specific identifiable element on screen."
            : "MOCK: A generic scripted reference became a specific identifiable element on screen.",
      };
    });
    for (const cutIndex of unusedCut) {
      matches.push({
        script_index: null,
        cut_index: cutIndex,
        relationship: "cut_only",
        explanation: verified
          ? "This element entered through the supplied picture and was not identified in the documentary script."
          : "MOCK: This element entered through the filmed material and was not in the screenplay.",
      });
    }
    return ReconciliationResultSchema.parse({ matches });
  }

  async answerCopilot(input: { project: Project; question: string }) {
    const asksForApproval = /approve|clear|sign[ -]?off|legal(?:ly)? safe/i.test(input.question);
    return CopilotAnswerSchema.parse({
      answer: asksForApproval
        ? "I cannot approve or clear an item. I can organize the evidence and gaps for the coordinator or counsel to review."
        : isVerifiedSample(input.project.title)
          ? `The current record contains ${input.project.items.length} timecoded clearance case(s). The open questions are concentrated in protected NASA identifiers, the unidentified score, identifiable-person use, and shot-level NASA/ESA provenance.`
          : `MOCK: I found ${input.project.items.length} clearance case(s) in the current project evidence.`,
      citations: isVerifiedSample(input.project.title)
        ? [...new Set(input.project.items.flatMap((item) => (item.sources ?? []).map((source) => source.url)))].slice(0, 4)
        : [],
    });
  }
}

/**
 * Each clearance stage is a Google ADK `LlmAgent`. The agent is the unit of work:
 * it owns the instruction, the Gemini model binding, and the schema its answer
 * must satisfy. `Runner` drives it to a final response over an ADK session.
 */
type AgentSpec = {
  operation: string;
  agentName: string;
  description: string;
  instruction: string;
};

function firstJsonObject(text: string): unknown {
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    return unfenced;
  }
}

export class LiveGeminiClient implements GeminiClient {
  readonly #request?: RequestFunction;
  readonly #apiKey: string;
  readonly #model: string;
  #genai?: GoogleGenAI;

  constructor(options: { apiKey: string; model?: string; request?: RequestFunction }) {
    if (!options.apiKey.trim()) throw new Error("GOOGLE_API_KEY is required for live Gemini mode.");
    this.#apiKey = options.apiKey;
    this.#model = options.model ?? "gemini-3.8-flash";
    this.#request = options.request;
  }

  /** Builds the ADK agent for one clearance stage. */
  #agent<T>(spec: AgentSpec, output: z.ZodType<T>): LlmAgent {
    return new LlmAgent({
      name: spec.agentName,
      model: new Gemini({ model: this.#model, apiKey: this.#apiKey }),
      description: spec.description,
      instruction: `${GEMINI_SYSTEM}\n\n${spec.instruction}`,
      outputSchema: output as unknown as LlmAgentSchema,
      generateContentConfig: { temperature: 0.2 },
    });
  }

  /** Runs an ADK agent to its final response and validates the structured answer. */
  async #runAgent<T>(spec: AgentSpec, output: z.ZodType<T>, parts: PartUnion[]): Promise<T> {
    const agent = this.#agent(spec, output);
    const sessionService = new InMemorySessionService();
    const runner = new Runner({ agent, appName: ADK_APP_NAME, sessionService });
    const sessionId = crypto.randomUUID();
    await sessionService.createSession({ appName: ADK_APP_NAME, userId: ADK_USER_ID, sessionId });

    let answer = "";
    for await (const event of runner.runAsync({
      userId: ADK_USER_ID,
      sessionId,
      newMessage: createUserContent(parts),
    })) {
      if (event.author !== spec.agentName) continue;
      const text = (event.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      if (text) answer = text;
    }
    return validateOutput("Gemini", output, firstJsonObject(answer));
  }

  /**
   * Sends one stage to Gemini. An injected `request` (tests, replay) keeps the
   * raw generateContent envelope; otherwise the stage runs as an ADK agent.
   */
  async #structured<T>(
    spec: AgentSpec,
    prompt: string,
    output: z.ZodType<T>,
    media?: { legacy: unknown; part: PartUnion },
  ): Promise<T> {
    if (this.#request) {
      const raw = await this.#request(spec.operation, {
        systemInstruction: { parts: [{ text: GEMINI_SYSTEM }] },
        contents: [{ role: "user", parts: [...(media ? [media.legacy] : []), { text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseJsonSchema: output.toJSONSchema(),
        },
      });
      return validateOutput("Gemini", output, textFromGemini(raw));
    }
    return this.#runAgent(spec, output, [...(media ? [media.part] : []), prompt]);
  }

  /**
   * Stages the rough cut for Gemini. Cuts within the inline ceiling travel in the
   * request body; anything larger is uploaded through the Files API so a real
   * feature-length cut is analysable rather than rejected.
   */
  async #videoPart(input: CutScanInput): Promise<PartUnion> {
    const base64 = () => Buffer.from(input.bytes).toString("base64");
    if (input.bytes.byteLength <= INLINE_MEDIA_LIMIT_BYTES) {
      return createPartFromBase64(base64(), input.mimeType);
    }
    const ai = (this.#genai ??= new GoogleGenAI({ apiKey: this.#apiKey }));
    let file = await ai.files.upload({
      file: new Blob([input.bytes as Uint8Array<ArrayBuffer>], { type: input.mimeType }),
      config: { mimeType: input.mimeType },
    });
    const deadline = Date.now() + FILE_PROCESSING_TIMEOUT_MS;
    while (file.state === "PROCESSING") {
      if (Date.now() > deadline) throw new Error("Gemini did not finish processing the cut in time.");
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      file = await ai.files.get({ name: file.name ?? "" });
    }
    if (file.state === "FAILED") throw new Error("Gemini could not process the uploaded cut.");
    if (!file.uri || !file.mimeType) throw new Error("Gemini returned no usable reference for the uploaded cut.");
    return createPartFromUri(file.uri, file.mimeType);
  }

  scanScreenplay(input: ScriptScanInput) {
    return this.#structured(
      {
        operation: "scan_screenplay",
        agentName: "screenplay_scanner",
        description: "Reads a screenplay and lists elements that may need clearance.",
        instruction: "Detect all named or identifiable songs, brands, art, people, organizations, locations, quotations, archival material, products, and signage. Anchor every candidate to its scene.",
      },
      `Production: ${input.productionTitle}\nSource: ${input.sourceVersion}\nScenes:\n${JSON.stringify(input.scenes)}`,
      ScriptScanResultSchema,
    );
  }

  async scanCut(input: CutScanInput) {
    const spec: AgentSpec = {
      operation: "scan_cut",
      agentName: "cut_scanner",
      description: "Watches a rough cut and lists timecoded elements that may need clearance.",
      instruction: "Report bounded second-based timecodes and prioritize unscripted elements. Transcribe any readable on-screen text so it can be researched.",
    };
    const prompt = `Production: ${input.productionTitle}\nSource: ${input.sourceVersion}\nDuration: ${input.durationSeconds}s\nScreenplay digest: ${input.screenplayDigest}`;
    if (this.#request && input.bytes.byteLength > INLINE_MEDIA_LIMIT_BYTES) {
      throw new Error("The cut exceeds Gemini inline media limits. Configure cloud media staging before live analysis.");
    }
    return this.#structured(spec, prompt, CutScanResultSchema, {
      legacy: { inlineData: { mimeType: input.mimeType, data: Buffer.from(input.bytes).toString("base64") } },
      part: await this.#videoPart(input),
    });
  }

  reconcile(input: ReconcileInput) {
    return this.#structured(
      {
        operation: "reconcile",
        agentName: "page_to_screen_reconciler",
        description: "Matches screenplay candidates against cut detections.",
        instruction: "Reconcile the screenplay candidates and cut detections. Use every index once. A generic script reference paired with a specific cut work is materially_changed.",
      },
      JSON.stringify(input),
      ReconciliationResultSchema,
    );
  }

  answerCopilot(input: { project: Project; question: string }) {
    return this.#structured(
      {
        operation: "copilot",
        agentName: "clearance_copilot",
        description: "Explains the stored clearance record to a coordinator.",
        instruction: "Answer the coordinator's question using only the evidence supplied. You cannot alter status or approve anything. If evidence is absent, say it is unknown.",
      },
      `QUESTION: ${input.question}\nEVIDENCE: ${projectContext(input.project)}`,
      CopilotAnswerSchema,
    );
  }
}
