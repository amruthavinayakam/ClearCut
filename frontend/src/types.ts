export type HeatColor = "red" | "amber" | "blue" | "green" | "gray";

export type Actor = "agent" | "coordinator" | "counsel" | "system";

export type WorkflowStatus =
  | "detected"
  | "researching"
  | "evidence_ready"
  | "coordinator_verified"
  | "counsel_approved"
  | "documented_permission"
  | "approved_replacement"
  | "unresolved"
  | "false_positive"
  | "waiting_on_rights_holder"
  | "replacement_requested"
  | "reopened_by_revision"
  | "reopened_by_monitor";

/** Mirrors HUMAN_OWNED_STATUSES on the server. The UI greys these out for the agent. */
export const HUMAN_OWNED: WorkflowStatus[] = [
  "coordinator_verified",
  "counsel_approved",
  "documented_permission",
  "approved_replacement",
  "false_positive",
];

export type ProjectPhase =
  | "created"
  | "scanning_script"
  | "scanning_cut"
  | "reconciling"
  | "researching"
  | "ready"
  | "failed";

export interface Timecode {
  start: number;
  end: number;
}

export interface CutDetection {
  timecode: Timecode;
  representative_time: number;
  modality: "visual" | "audio" | "both";
  observation: string;
  confidence: "low" | "medium" | "high";
  scene_match: number | null;
  expected_from_script: boolean;
}

export interface ScriptReference {
  scene_index: number;
  scene_heading: string;
  page: number | null;
  excerpt: string;
  usage_note: string;
}

export interface EvidenceSource {
  url: string;
  title: string | null;
  excerpt: string;
  publish_date: string | null;
  retrieved_at: string;
  via: "parallel_search" | "parallel_task" | "parallel_monitor" | "document";
  field: string | null;
}

export interface CandidateRightsHolder {
  name: string;
  role: string;
  rights_implicated: string[];
  share: string;
  confidence: "low" | "medium" | "high";
  basis: string;
}

export interface LicensingRoute {
  organization: string;
  route: string;
  contact: string;
  url: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: Actor;
  actor_name: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  rationale: string;
  source_version: string;
}

export interface ProductionDocument {
  id: string;
  kind: string;
  title: string;
  notes: string;
  covers_territory: string;
  covers_term: string;
  covers_media: string;
  attached_at: string;
  attached_by: string;
}

export interface ClearanceItem {
  id: string;
  name: string;
  category: string;
  description: string;
  provenance: "script_only" | "cut_only" | "both";
  source_version: string;
  script_references: ScriptReference[];
  cut_detections: CutDetection[];
  detection_confidence: "low" | "medium" | "high";
  research_priority: "low" | "medium" | "high";
  production_impact: string;
  workflow_status: WorkflowStatus;
  candidate_rights_holders: CandidateRightsHolder[];
  licensing_routes: LicensingRoute[];
  sources: EvidenceSource[];
  evidence_gaps: string[];
  unresolved_questions: string[];
  recommended_actions: string[];
  research_summary: string;
  research_error: string | null;
  task_run_id: string | null;
  documents: ProductionDocument[];
  monitor_id: string | null;
  assigned_to: string;
  draft_request: string | null;
  audit_events: AuditEvent[];
  // Server-computed conveniences
  color: HeatColor;
  citation_count: number;
  is_resolved: boolean;
}

export interface ReconciliationFinding {
  kind: "in_both" | "script_only" | "cut_only" | "materially_changed" | "approval_stale";
  item_id: string;
  item_name: string;
  explanation: string;
}

export interface ProjectSummary {
  colors: Record<HeatColor, number>;
  by_category: Record<string, number>;
  total_items: number;
  unscripted_items: number;
  resolved_items: number;
  total_citations: number;
  reconciliation: Record<string, number>;
  ai_issued_approvals: number;
}

export interface Project {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  phase: ProjectPhase;
  error: string | null;
  script: { label: string; filename: string; title: string; page_count: number; scene_count: number } | null;
  cut: { label: string; filename: string; duration_s: number; media_url: string } | null;
  items: ClearanceItem[];
  reconciliation: ReconciliationFinding[];
  audit_events: AuditEvent[];
  summary: ProjectSummary;
}

export interface AppConfig {
  mock_research: boolean;
  parallel_configured: boolean;
  vertex: boolean;
  project: string | null;
  search_mode: string;
  processor: string;
  gcs_bucket: string | null;
  webhooks_enabled: boolean;
  sample_available: boolean;
}

export interface MonitorRecord {
  monitor_id: string;
  project_id: string;
  item_id: string;
  item_name: string;
  query: string;
  frequency: string;
  status: string;
  events: { event_id: string | null; event_date: string | null; content: string | null }[];
}

export const CATEGORY_LABEL: Record<string, string> = {
  brand: "Brand",
  artwork: "Artwork",
  music: "Music",
  real_person: "Real person",
  organization: "Organization",
  location: "Location",
  quotation: "Quotation",
  archival: "Archival",
  product: "Product",
  signage: "Signage",
  other: "Other",
};

export const STATUS_LABEL: Record<WorkflowStatus, string> = {
  detected: "Detected",
  researching: "Researching",
  evidence_ready: "Evidence ready",
  coordinator_verified: "Coordinator verified",
  counsel_approved: "Counsel approved",
  documented_permission: "Documented permission",
  approved_replacement: "Approved replacement",
  unresolved: "Unresolved",
  false_positive: "False positive",
  waiting_on_rights_holder: "Waiting on rights holder",
  replacement_requested: "Replacement requested",
  reopened_by_revision: "Reopened by revision",
  reopened_by_monitor: "Reopened by monitor",
};

export function formatTimecode(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(2).padStart(5, "0")}`;
}
