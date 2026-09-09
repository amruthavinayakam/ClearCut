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
  asset_store: z.enum(["filesystem", "gcs", "r2"]).default("filesystem"),
  webhooks_enabled: z.boolean(),
  sample_available: z.boolean(),
  /** False means a restart discards every production. */
  durable: z.boolean().default(false),
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

export const UploadedAssetSchema = z.object({
  key: z.string(),
  filename: z.string(),
  content_type: z.string(),
  size_bytes: z.number().int().positive(),
  etag: z.string().nullable(),
}).strict();

export const UploadSessionCreateSchema = z.object({
  project_id: z.string().min(1),
  kind: z.enum(["script", "cut", "document"]),
  filename: z.string().min(1).max(255),
  size_bytes: z.number().int().positive(),
  content_type: z.string().min(1).max(200),
}).strict();

export const UploadSessionSchema = UploadSessionCreateSchema.extend({
  session_id: z.string(),
  key: z.string(),
  expires_at: z.string(),
  completed_at: z.string().nullable(),
  etag: z.string().nullable(),
  multipart_upload_id: z.string().nullable(),
  upload_url: z.string().url().nullable(),
  multipart: z.object({
    upload_id: z.string().nullable(),
    part_size: z.number().int().positive(),
    part_count: z.number().int().positive().max(10_000),
    parts: z.array(z.object({
      part_number: z.number().int().positive(),
      upload_url: z.string().url(),
    }).strict()),
  }).strict().nullable(),
}).strict();

export const UploadFinalizeSchema = z.object({
  parts: z.array(z.object({
    part_number: z.number().int().positive(),
    etag: z.string().min(1),
  }).strict()).default([]),
}).strict();

export const UploadFinalizeResultSchema = z.object({
  session_id: z.string(),
  completed_at: z.string(),
  asset: UploadedAssetSchema,
}).strict();

export const StoredUploadReferenceSchema = UploadedAssetSchema.extend({
  etag: z.string(),
}).strict();

export const CloudProjectCreateSchema = z.object({
  project_id: z.string().startsWith("proj_"),
  title: z.string().max(200).default("Untitled production"),
  script_asset: StoredUploadReferenceSchema.nullable().default(null),
  script_details: z.record(z.string(), z.unknown()).nullable().default(null),
  cut_asset: StoredUploadReferenceSchema.nullable().default(null),
  cut_details: z.record(z.string(), z.unknown()).nullable().default(null),
}).strict().refine((input) => input.script_asset || input.cut_asset, {
  message: "A screenplay or cut asset is required.",
});

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
export type UploadedAsset = z.infer<typeof UploadedAssetSchema>;
export type UploadSessionCreate = z.infer<typeof UploadSessionCreateSchema>;
export type UploadSession = z.infer<typeof UploadSessionSchema>;
export type UploadFinalize = z.infer<typeof UploadFinalizeSchema>;
export type UploadFinalizeResult = z.infer<typeof UploadFinalizeResultSchema>;
export type StoredUploadReference = z.infer<typeof StoredUploadReferenceSchema>;
export type CloudProjectCreate = z.infer<typeof CloudProjectCreateSchema>;
