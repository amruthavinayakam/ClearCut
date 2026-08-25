import { z } from "zod";

import {
  ActorSchema,
  IntendedUseProfileSchema,
  MonitorRecordSchema,
  ProjectListItemSchema,
  ProjectRevisionSchema,
  ProjectSchema,
  WorkflowStatusSchema,
} from "./project";

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  request_id: z.string(),
  field_errors: z.record(z.string(), z.array(z.string())).optional(),
  retry: z.object({
    allowed: z.boolean(),
    after_ms: z.number().int().nonnegative().optional(),
  }).strict().optional(),
}).strict();

export const PreflightErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
}).strict();

export const PreflightResultSchema = z.object({
  kind: z.enum(["screenplay", "cut", "unknown"]),
  filename: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  accepted: z.boolean(),
  details: z.record(z.string(), z.unknown()),
  errors: z.array(PreflightErrorSchema),
}).strict();

export const AppConfigSchema = z.object({
  mock_research: z.boolean(),
  parallel_configured: z.boolean(),
  vertex: z.boolean(),
  project: z.string().nullable(),
  search_mode: z.string(),
  processor: z.string(),
  gcs_bucket: z.string().nullable().optional(),
  asset_store: z.enum(["filesystem", "r2"]).default("filesystem"),
  webhooks_enabled: z.boolean(),
  sample_available: z.boolean(),
}).strict();

export const ProjectListSchema = z.object({
  projects: z.array(ProjectListItemSchema),
}).strict();

export const RevisionApplyResultSchema = z.object({
  revision: ProjectRevisionSchema,
  project: ProjectSchema,
  already_applied: z.boolean(),
}).strict();

export const MonitorListSchema = z.object({
  monitors: z.array(MonitorRecordSchema),
}).strict();

export const HealthSchema = z.object({ status: z.literal("ok") }).strict();

export const StatusChangeSchema = z.object({
  status: WorkflowStatusSchema,
  actor: ActorSchema.default("coordinator"),
  actor_name: z.string().max(80).default(""),
  rationale: z.string().min(1).max(1_000),
  document_ids: z.array(z.string()).default([]),
}).strict();

export const CoordinationChangeSchema = z.object({
  assigned_to: z.string().max(80),
}).strict();

export const UseProfileChangeSchema = IntendedUseProfileSchema;

export const DocumentMetadataPatchSchema = z.object({
  kind: z.enum(["release", "license", "permit", "correspondence", "other"]).optional(),
  title: z.string().max(200).optional(),
  notes: z.string().max(4_000).optional(),
  covers_territory: z.string().max(500).optional(),
  covers_term: z.string().max(500).optional(),
  covers_media: z.string().max(500).optional(),
  media: z.array(z.string()).optional(),
  territories: z.array(z.string()).optional(),
  starts_on: z.string().nullable().optional(),
  ends_on: z.string().nullable().optional(),
  perpetual: z.boolean().optional(),
  covered_use: z.string().max(2_000).optional(),
  attached_by: z.string().max(80).optional(),
}).strict();

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type PreflightResult = z.infer<typeof PreflightResultSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
export type RevisionApplyResult = z.infer<typeof RevisionApplyResultSchema>;
export type StatusChange = z.infer<typeof StatusChangeSchema>;
export type CoordinationChange = z.infer<typeof CoordinationChangeSchema>;
export type DocumentMetadataPatch = z.infer<typeof DocumentMetadataPatchSchema>;
