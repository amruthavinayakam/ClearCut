import type { ClearanceItem, WorkflowStatus } from "@clearcut/contracts";

/**
 * Plain words for the panel a coordinator actually reads.
 *
 * The record's own vocabulary is precise and unreadable: a case arrived
 * labelled AMBER RISK / EVIDENCE READY / DETECTION / RIGHTS CANDIDATE /
 * LICENSING ROUTE / NEXT HUMAN ACTION, six pieces of jargon shouted in
 * monospace capitals before a single fact. The stored values stay exactly as
 * they are — the audit trail depends on them — and only the display changes.
 */

/** Risk reads as an instruction, not as a colour the reader has to decode. */
export const RISK_LABEL: Record<string, string> = {
  red: "High risk",
  amber: "Needs attention",
  green: "Low risk",
  blue: "For information",
  gray: "Not rated",
};

export const STATUS_LABEL: Record<WorkflowStatus, string> = {
  detected: "Found",
  researching: "Researching",
  evidence_ready: "Ready to review",
  coordinator_verified: "Verified",
  counsel_approved: "Approved by counsel",
  documented_permission: "Permission on file",
  approved_replacement: "Replacement approved",
  unresolved: "Needs more work",
  false_positive: "Not an issue",
  waiting_on_rights_holder: "Waiting on the rights holder",
  replacement_requested: "Replacement requested",
  reopened_by_revision: "Reopened by a new version",
  reopened_by_monitor: "Reopened by a change",
};

export const PROVENANCE_LABEL: Record<ClearanceItem["provenance"], string> = {
  script_only: "In the script only",
  cut_only: "On screen only",
  both: "Script and screen",
};

/** How a source was found, said plainly rather than as a provider enum. */
export const RETRIEVAL_LABEL: Record<string, string> = {
  parallel_search: "Web search",
  parallel_task: "Deep research",
  parallel_monitor: "Change watch",
  document: "Attached file",
};

export function frequencyLabel(frequency: string): string {
  return { "1h": "every hour", "1d": "every day", "1w": "every week" }[frequency] ?? `every ${frequency}`;
}
