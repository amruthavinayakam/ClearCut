import { z } from "zod";

export const HeatColorSchema = z.enum(["red", "amber", "blue", "green", "gray"]);
export const ActorSchema = z.enum(["agent", "coordinator", "counsel", "system"]);
export const CategorySchema = z.enum([
  "brand",
  "artwork",
  "music",
  "real_person",
  "organization",
  "location",
  "quotation",
  "archival",
  "product",
  "signage",
  "other",
]);
export const ConfidenceSchema = z.enum(["low", "medium", "high"]);
export const WorkflowStatusSchema = z.enum([
  "detected",
  "researching",
  "evidence_ready",
  "coordinator_verified",
  "counsel_approved",
  "documented_permission",
  "approved_replacement",
  "unresolved",
  "false_positive",
  "waiting_on_rights_holder",
  "replacement_requested",
  "reopened_by_revision",
  "reopened_by_monitor",
]);
export const ProjectPhaseSchema = z.enum([
  "created",
  "scanning_script",
  "scanning_cut",
  "reconciling",
  "researching",
  "ready",
  "failed",
]);

export const TimecodeSchema = z.object({ start: z.number(), end: z.number() }).strict();

export const CutDetectionSchema = z.object({
  timecode: TimecodeSchema,
  representative_time: z.number(),
  modality: z.enum(["visual", "audio", "both"]),
  observation: z.string(),
  confidence: ConfidenceSchema,
  scene_match: z.number().int().nullable(),
  expected_from_script: z.boolean(),
}).strict();

export const ScriptReferenceSchema = z.object({
  scene_index: z.number().int(),
  scene_heading: z.string(),
  page: z.number().int().nullable(),
  excerpt: z.string(),
  usage_note: z.string(),
}).strict();

export const EvidenceSourceSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable(),
  excerpt: z.string(),
  publish_date: z.string().nullable(),
  retrieved_at: z.string(),
  via: z.enum(["parallel_search", "parallel_task", "parallel_monitor", "document"]),
  field: z.string().nullable(),
}).strict();

export const CandidateRightsHolderSchema = z.object({
  name: z.string(),
  role: z.string(),
  rights_implicated: z.array(z.string()),
  share: z.string(),
  confidence: ConfidenceSchema,
  basis: z.string(),
}).strict();

export const LicensingRouteSchema = z.object({
  organization: z.string(),
  route: z.string(),
  contact: z.string(),
  url: z.string(),
}).strict();

export const AuditEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  actor: ActorSchema,
  actor_name: z.string(),
  action: z.string(),
  from_status: z.string().nullable(),
  to_status: z.string().nullable(),
  rationale: z.string(),
  source_version: z.string(),
  detail: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const ActivityEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  phase: z.string(),
  message: z.string(),
  detail: z.record(z.string(), z.unknown()),
}).strict();

export const ProductionDocumentSchema = z.object({
  id: z.string(),
  kind: z.enum(["release", "license", "permit", "correspondence", "other"]),
  title: z.string(),
  notes: z.string(),
  covers_territory: z.string(),
  covers_term: z.string(),
  covers_media: z.string(),
  original_filename: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  storage_key: z.string(),
  media: z.array(z.string()),
  territories: z.array(z.string()),
  starts_on: z.string().nullable(),
  ends_on: z.string().nullable(),
  perpetual: z.boolean(),
  covered_use: z.string(),
  attached_at: z.string(),
  attached_by: z.string(),
}).strict();

export const IntendedUseProfileSchema = z.object({
  media: z.array(z.string()),
  territories: z.array(z.string()),
  starts_on: z.string().nullable(),
  ends_on: z.string().nullable(),
}).strict();

export const DocumentScopeSchema = IntendedUseProfileSchema.extend({
  perpetual: z.boolean(),
  covered_use: z.string(),
}).strict();

export const ScopeAssessmentSchema = z.object({
  outcome: z.enum(["covers", "partial", "unknown", "expired"]),
  gaps: z.array(z.string()),
}).strict();

export const ClearanceItemSchema = z.object({
  id: z.string(),
  stable_item_id: z.string(),
  name: z.string(),
  category: CategorySchema,
  description: z.string(),
  provenance: z.enum(["script_only", "cut_only", "both"]),
  source_version: z.string(),
  script_references: z.array(ScriptReferenceSchema),
  cut_detections: z.array(CutDetectionSchema),
  detection_confidence: ConfidenceSchema,
  research_priority: z.enum(["low", "medium", "high"]),
  production_impact: z.string(),
  workflow_status: WorkflowStatusSchema,
  candidate_rights_holders: z.array(CandidateRightsHolderSchema),
  licensing_routes: z.array(LicensingRouteSchema),
  sources: z.array(EvidenceSourceSchema),
  evidence_gaps: z.array(z.string()),
  unresolved_questions: z.array(z.string()),
  recommended_actions: z.array(z.string()),
  research_summary: z.string(),
  research_error: z.string().nullable(),
  task_run_id: z.string().nullable(),
  documents: z.array(ProductionDocumentSchema),
  monitor_id: z.string().nullable(),
  assigned_to: z.string(),
  draft_request: z.string().nullable(),
  audit_events: z.array(AuditEventSchema),
  color: HeatColorSchema,
  citation_count: z.number().int().nonnegative(),
  is_resolved: z.boolean(),
}).strict();

export const ReconciliationFindingSchema = z.object({
  kind: z.enum(["in_both", "script_only", "cut_only", "materially_changed", "approval_stale"]),
  item_id: z.string(),
  item_name: z.string(),
  explanation: z.string(),
}).strict();

export const ScriptVersionSchema = z.object({
  id: z.string(),
  label: z.string(),
  filename: z.string(),
  title: z.string(),
  page_count: z.number().int().nonnegative(),
  scene_count: z.number().int().nonnegative(),
  storage_key: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  uploaded_at: z.string().optional(),
}).strict();

export const CutVersionSchema = z.object({
  id: z.string(),
  label: z.string(),
  filename: z.string(),
  duration_s: z.number().nonnegative(),
  storage_key: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  gcs_uri: z.string().nullable().optional(),
  media_url: z.string(),
  uploaded_at: z.string().optional(),
}).strict();

export const RevisionChangeKindSchema = z.enum([
  "unchanged",
  "added",
  "removed",
  "materially_changed",
  "decision_stale",
]);

export const RevisionChangeSchema = z.object({
  kind: RevisionChangeKindSchema,
  stable_item_id: z.string(),
  item_name: z.string(),
  before_item_id: z.string().nullable(),
  after_item_id: z.string().nullable(),
  explanation: z.string(),
  match_basis: z.string(),
  previous_status: WorkflowStatusSchema.nullable(),
}).strict();

export const ProjectRevisionSchema = z.object({
  id: z.string(),
  sequence: z.number().int().positive(),
  script: ScriptVersionSchema.nullable(),
  cut: CutVersionSchema.nullable(),
  state: z.enum(["processing", "ready", "failed", "applied"]),
  items: z.array(ClearanceItemSchema),
  changes: z.array(RevisionChangeSchema),
  predecessor_id: z.string().nullable(),
  created_at: z.string(),
  applied_at: z.string().nullable(),
  error: z.string().nullable(),
}).strict();

export const ProjectRevisionSummarySchema = ProjectRevisionSchema.omit({ items: true }).extend({
  item_count: z.number().int().nonnegative(),
  change_counts: z.record(RevisionChangeKindSchema, z.number().int().nonnegative()),
}).strict();

export const ProjectSummarySchema = z.object({
  colors: z.record(HeatColorSchema, z.number().int().nonnegative()),
  by_category: z.record(z.string(), z.number().int().nonnegative()),
  total_items: z.number().int().nonnegative(),
  unscripted_items: z.number().int().nonnegative(),
  resolved_items: z.number().int().nonnegative(),
  /**
   * Cases a person has ruled on, which is not the same as resolved: a
   * coordinator's verification is a decision, but only counsel approval, a
   * filed permission, an approved replacement or a false positive resolves a
   * case. Counting only the latter made recording a decision look like nothing
   * had happened.
   */
  decided_items: z.number().int().nonnegative().default(0),
  total_citations: z.number().int().nonnegative(),
  reconciliation: z.record(z.string(), z.number().int().nonnegative()),
  ai_issued_approvals: z.number().int().nonnegative(),
}).strict();

export const ProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullable(),
  phase: ProjectPhaseSchema,
  error: z.string().nullable(),
  script: ScriptVersionSchema.nullable(),
  cut: CutVersionSchema.nullable(),
  script_history: z.array(ScriptVersionSchema).default([]),
  cut_history: z.array(CutVersionSchema).default([]),
  items: z.array(ClearanceItemSchema),
  reconciliation: z.array(ReconciliationFindingSchema),
  audit_events: z.array(AuditEventSchema),
  activity_events: z.array(ActivityEventSchema),
  use_profile: IntendedUseProfileSchema,
  revisions: z.array(ProjectRevisionSchema).default([]),
  active_revision_id: z.string().nullable(),
  summary: ProjectSummarySchema,
}).strict();

export const ProjectStateLabelSchema = z.enum([
  "Processing",
  "Needs review",
  "Ready for counsel",
  "Documented",
  "Reopened",
  "Failed",
]);

export const ProjectListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  phase: ProjectPhaseSchema,
  created_at: z.string(),
  updated_at: z.string(),
  script_label: z.string().nullable(),
  cut_label: z.string().nullable(),
  unresolved_count: z.number().int().nonnegative(),
  total_items: z.number().int().nonnegative(),
  state_label: ProjectStateLabelSchema,
  archived_at: z.string().nullable(),
}).strict();

export const MonitorRecordSchema = z.object({
  monitor_id: z.string(),
  project_id: z.string(),
  item_id: z.string(),
  item_name: z.string(),
  query: z.string(),
  frequency: z.string(),
  created_at: z.string().optional(),
  status: z.string(),
  events: z.array(z.object({
    event_id: z.string().nullable(),
    event_date: z.string().nullable(),
    content: z.string().nullable(),
  }).passthrough()),
}).strict();

export type Category = z.infer<typeof CategorySchema>;
export type HeatColor = z.infer<typeof HeatColorSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;
export type ProjectPhase = z.infer<typeof ProjectPhaseSchema>;
export type Timecode = z.infer<typeof TimecodeSchema>;
export type CutDetection = z.infer<typeof CutDetectionSchema>;
export type ScriptReference = z.infer<typeof ScriptReferenceSchema>;
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;
export type CandidateRightsHolder = z.infer<typeof CandidateRightsHolderSchema>;
export type LicensingRoute = z.infer<typeof LicensingRouteSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;
export type ProductionDocument = z.infer<typeof ProductionDocumentSchema>;
export type IntendedUseProfile = z.infer<typeof IntendedUseProfileSchema>;
export type DocumentScope = z.infer<typeof DocumentScopeSchema>;
export type ScopeAssessment = z.infer<typeof ScopeAssessmentSchema>;
export type ClearanceItem = z.infer<typeof ClearanceItemSchema>;
export type ReconciliationFinding = z.infer<typeof ReconciliationFindingSchema>;
export type ScriptVersion = z.infer<typeof ScriptVersionSchema>;
export type CutVersion = z.infer<typeof CutVersionSchema>;
export type RevisionChangeKind = z.infer<typeof RevisionChangeKindSchema>;
export type RevisionChange = z.infer<typeof RevisionChangeSchema>;
export type ProjectRevision = z.infer<typeof ProjectRevisionSchema>;
export type ProjectRevisionSummary = z.infer<typeof ProjectRevisionSummarySchema>;
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectListItem = z.infer<typeof ProjectListItemSchema>;
export type MonitorRecord = z.infer<typeof MonitorRecordSchema>;
