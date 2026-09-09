import {
  ApiErrorSchema,
  MonitorRecordSchema,
  ProjectRevisionSchema,
  type ClearanceItem,
  type MonitorRecord,
  type ProjectRevision,
  type StatusChange,
} from "@clearcut/contracts";

import { ApiClientError, readJsonBody, transportMessage } from "./api-client";

async function jsonResponse<T>(response: Response, parse: (value: unknown) => T): Promise<T> {
  const data = await readJsonBody(response);
  if (!response.ok) {
    const problem = ApiErrorSchema.safeParse(data);
    throw new ApiClientError(problem.success ? problem.data.message : transportMessage(response.status), problem.success ? problem.data.code : "request_failed", problem.success ? problem.data.request_id : undefined);
  }
  if (data === null) throw new ApiClientError(transportMessage(response.status), "unreadable_response");
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

export type CopilotStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; citations: string[] }
  | { type: "error"; message: string };

export type CopilotClient = {
  ask(projectId: string, question: string): Promise<{ answer: string; citations: Array<{ url?: string; title?: string }>; session_id: string }>;
  askStream(projectId: string, question: string, signal?: AbortSignal): AsyncIterable<CopilotStreamEvent>;
};

/**
 * Reads the copilot SSE stream. EventSource cannot POST, so the frames are
 * parsed here off a fetch body reader.
 */
async function* askCopilotStream(
  projectId: string,
  question: string,
  signal?: AbortSignal,
): AsyncIterable<CopilotStreamEvent> {
  const response = await fetch(`/api/projects/${projectId}/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`The copilot could not answer (${response.status}).`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    // SSE frames are separated by a blank line.
    let split = buffer.indexOf("\n\n");
    for (; split !== -1; split = buffer.indexOf("\n\n")) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trim());
      }
      if (!data.length) continue;
      const payload = JSON.parse(data.join("\n"));
      if (event === "delta") yield { type: "delta", text: payload.text as string };
      else if (event === "done") yield { type: "done", citations: (payload.citations ?? []) as string[] };
      else if (event === "error") yield { type: "error", message: payload.message as string };
    }
  }
}

export const dispositionClient: DispositionClient = { setStatus: setItemStatus };
export const monitorClient: MonitorClient = { createMonitor: createItemMonitor };
export const documentClient: DocumentClient = { uploadDocument: uploadItemDocument };
export const copilotClient: CopilotClient = { ask: askCopilot, askStream: askCopilotStream };

export type ItemWithDocuments = Pick<ClearanceItem, "documents">;
