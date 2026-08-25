import { z } from "zod";

import {
  CandidateRightsHolderSchema,
  CategorySchema,
  ConfidenceSchema,
  EvidenceSourceSchema,
  LicensingRouteSchema,
  MonitorRecordSchema,
  type ClearanceItem,
  type EvidenceSource,
  type MonitorRecord,
  type Project,
} from "@clearcut/contracts";

export const ScriptCandidateSchema = z.object({
  name: z.string(),
  category: CategorySchema,
  description: z.string(),
  scene_index: z.number().int(),
  scene_heading: z.string(),
  page: z.number().int().nullable(),
  excerpt: z.string(),
  usage_note: z.string(),
  confidence: ConfidenceSchema,
  priority: z.enum(["low", "medium", "high"]),
  production_impact: z.string(),
}).strict();

export const ScriptScanResultSchema = z.object({
  candidates: z.array(ScriptCandidateSchema),
}).strict();

export const CutCandidateSchema = z.object({
  name: z.string(),
  category: CategorySchema,
  description: z.string(),
  start_seconds: z.number().nonnegative(),
  end_seconds: z.number().nonnegative(),
  representative_seconds: z.number().nonnegative(),
  modality: z.enum(["visual", "audio", "both"]),
  observation: z.string(),
  readable_text: z.string(),
  confidence: ConfidenceSchema,
}).strict();

export const CutScanResultSchema = z.object({
  notes: z.string(),
  detections: z.array(CutCandidateSchema),
}).strict();

export const ReconciliationMatchSchema = z.object({
  script_index: z.number().int().nonnegative().nullable(),
  cut_index: z.number().int().nonnegative().nullable(),
  relationship: z.enum(["in_both", "script_only", "cut_only", "materially_changed"]),
  explanation: z.string(),
}).strict();

export const ReconciliationResultSchema = z.object({ matches: z.array(ReconciliationMatchSchema) }).strict();

export const DossierSchema = z.object({
  candidate_rights_holders: z.array(CandidateRightsHolderSchema),
  licensing_routes: z.array(LicensingRouteSchema),
  research_summary: z.string(),
  evidence_gaps: z.array(z.string()),
  unresolved_questions: z.array(z.string()),
  recommended_actions: z.array(z.string()),
  public_domain_status: z.string(),
  known_disputes: z.string(),
  overall_confidence: ConfidenceSchema,
  run_id: z.string(),
  basis: z.array(z.object({
    field: z.string(),
    reasoning: z.string(),
    confidence: z.string().nullable(),
    citations: z.array(z.object({
      url: z.string().url(),
      title: z.string().nullable(),
      excerpts: z.array(z.string()),
    }).strict()),
  }).strict()).default([]),
}).strict();

export const CopilotAnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(z.string().url()).default([]),
}).strict();

export type ScriptScanInput = {
  productionTitle: string;
  sourceVersion: string;
  scenes: Array<{ index: number; heading: string; page: number | null; text: string }>;
};

export type CutScanInput = {
  productionTitle: string;
  sourceVersion: string;
  durationSeconds: number;
  mimeType: string;
  bytes: Uint8Array;
  screenplayDigest: string;
};

export type ReconcileInput = {
  productionTitle: string;
  script: z.infer<typeof ScriptCandidateSchema>[];
  cut: z.infer<typeof CutCandidateSchema>[];
};

export interface GeminiClient {
  scanScreenplay(input: ScriptScanInput): Promise<z.infer<typeof ScriptScanResultSchema>>;
  scanCut(input: CutScanInput): Promise<z.infer<typeof CutScanResultSchema>>;
  reconcile(input: ReconcileInput): Promise<z.infer<typeof ReconciliationResultSchema>>;
  answerCopilot(input: { project: Project; question: string }): Promise<z.infer<typeof CopilotAnswerSchema>>;
}

export interface ParallelClient {
  searchClearanceItem(item: ClearanceItem, productionTitle: string, sessionId: string): Promise<EvidenceSource[]>;
  buildDossier(item: ClearanceItem, productionTitle: string, sources: EvidenceSource[]): Promise<z.infer<typeof DossierSchema>>;
  createMonitor(item: ClearanceItem, productionTitle: string, projectId: string, frequency: string): Promise<MonitorRecord>;
  readMonitorEvents(monitorId: string): Promise<MonitorRecord["events"]>;
}

export type RequestFunction = (operation: string, input: unknown) => Promise<unknown>;

export class IntegrationOutputError extends Error {
  constructor(provider: string, cause: unknown) {
    super(`${provider} returned output that does not match the clearance contract.`, { cause });
    this.name = "IntegrationOutputError";
  }
}

export function validateOutput<T>(provider: string, schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new IntegrationOutputError(provider, parsed.error);
  return parsed.data;
}

export const IntegrationSchemas = {
  evidenceSource: EvidenceSourceSchema,
  monitor: MonitorRecordSchema,
};

export type Dossier = z.infer<typeof DossierSchema>;
export type ScriptCandidate = z.infer<typeof ScriptCandidateSchema>;
export type CutCandidate = z.infer<typeof CutCandidateSchema>;
export type ReconciliationMatch = z.infer<typeof ReconciliationMatchSchema>;
