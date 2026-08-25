import { z } from "zod";

import {
  MonitorRecordSchema,
  ProjectListItemSchema,
  ProjectRevisionSchema,
  ProjectSchema,
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

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type PreflightResult = z.infer<typeof PreflightResultSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
export type RevisionApplyResult = z.infer<typeof RevisionApplyResultSchema>;
