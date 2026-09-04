import {
  ApiErrorSchema,
  MonitorRecordSchema,
  ProjectRevisionSchema,
  type ClearanceItem,
  type MonitorRecord,
  type ProjectRevision,
  type StatusChange,
} from "@clearcut/contracts";

import { ApiClientError } from "./api-client";

async function jsonResponse<T>(response: Response, parse: (value: unknown) => T): Promise<T> {
  const data: unknown = await response.json();
  if (!response.ok) {
    const problem = ApiErrorSchema.safeParse(data);
    throw new ApiClientError(problem.success ? problem.data.message : "The request failed.", problem.success ? problem.data.code : "request_failed", problem.success ? problem.data.request_id : undefined);
  }
  return parse(data);
}

export async function setItemStatus(projectId: string, itemId: string, change: StatusChange) {
  return jsonResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(change) }), (value) => value);
}

export async function createItemMonitor(projectId: string, itemId: string, frequency = "1d"): Promise<MonitorRecord> {
  return jsonResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}/monitor`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ frequency }) }), (value) => MonitorRecordSchema.parse(value));
}

export async function uploadItemDocument(projectId: string, itemId: string, body: FormData) {
  return jsonResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}/documents`, { method: "POST", body }), (value) => value);
}

export async function createProjectRevision(projectId: string, script: File | null, cut: File | null): Promise<ProjectRevision> {
  const body = new FormData();
  if (script) body.set("script", script);
  if (cut) body.set("cut", cut);
  return jsonResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/revisions`, { method: "POST", body }), (value) => ProjectRevisionSchema.parse(value));
}

export async function getProjectRevision(projectId: string, revisionId: string): Promise<ProjectRevision> {
  return jsonResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}`, { cache: "no-store" }), (value) => ProjectRevisionSchema.parse(value));
}

export async function applyProjectRevision(projectId: string, revision: ProjectRevision) {
  return jsonResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revision.id)}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ predecessor_id: revision.predecessor_id }) }), (value) => value);
}

export async function askCopilot(projectId: string, question: string): Promise<{ answer: string; citations: Array<{ url?: string; title?: string }>; session_id: string }> {
  return jsonResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, session_id: `chat-${projectId}` }) }), (value) => value as { answer: string; citations: Array<{ url?: string; title?: string }>; session_id: string });
}

export type DispositionClient = {
  setStatus(projectId: string, itemId: string, change: StatusChange): Promise<unknown>;
};

export type MonitorClient = {
  createMonitor(projectId: string, itemId: string): Promise<MonitorRecord>;
};

export type DocumentClient = {
  uploadDocument(projectId: string, itemId: string, body: FormData): Promise<unknown>;
};

export type CopilotClient = {
  ask(projectId: string, question: string): Promise<{ answer: string; citations: Array<{ url?: string; title?: string }>; session_id: string }>;
};

export const dispositionClient: DispositionClient = { setStatus: setItemStatus };
export const monitorClient: MonitorClient = { createMonitor: createItemMonitor };
export const documentClient: DocumentClient = { uploadDocument: uploadItemDocument };
export const copilotClient: CopilotClient = { ask: askCopilot };

export type ItemWithDocuments = Pick<ClearanceItem, "documents">;
