import type {
  Actor,
  AppConfig,
  MonitorRecord,
  Project,
  ProjectListItem,
  WorkflowStatus,
} from "../types";


async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // Preserve the status line for a non-JSON response.
    }
    const error = new Error(detail) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return (await response.json()) as T;
}

export const api = {
  config: () => request<AppConfig>("/api/config"),

  listProjects: (includeArchived = false) =>
    request<{ projects: ProjectListItem[] }>(
      `/api/projects${includeArchived ? "?include_archived=true" : ""}`,
    ),

  preflight: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<PreflightResult>("/api/uploads/preflight", { method: "POST", body: form });
  },

  createProject: (
    script: File | null,
    cut: File | null,
    title: string,
    onUploadProgress?: (ratio: number) => void,
  ) => {
    const form = new FormData();
    if (script) form.append("script", script);
    if (cut) form.append("cut", cut);
    form.append("title", title);
    return new Promise<Project>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/projects");
      xhr.responseType = "json";
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onUploadProgress) {
          onUploadProgress(Math.min(1, event.loaded / event.total));
        }
      };
      xhr.onerror = () => reject(new Error("The upload connection was lost."));
      xhr.onload = () => {
        const body = xhr.response as Project | { detail?: string } | null;
        if (xhr.status >= 200 && xhr.status < 300 && body) {
          resolve(body as Project);
          return;
        }
        const detail = body && "detail" in body ? body.detail : undefined;
        reject(new Error(detail || `${xhr.status} ${xhr.statusText}`));
      };
      xhr.send(form);
    });
  },

  runSample: () => request<Project>("/api/projects/sample", { method: "POST" }),
  getProject: (id: string) => request<Project>(`/api/projects/${id}`),

  setArchived: (projectId: string, archived: boolean) =>
    request<Project>(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    }),

  setStatus: (
    projectId: string,
    itemId: string,
    status: WorkflowStatus,
    actor: Actor,
    rationale: string,
    actorName = "",
  ) =>
    request<{ item_id: string; status: WorkflowStatus }>(
      `/api/projects/${projectId}/items/${itemId}/status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, actor, rationale, actor_name: actorName }),
      },
    ),

  draftRequest: (projectId: string, itemId: string) =>
    request<{ item_id: string; draft: string }>(
      `/api/projects/${projectId}/items/${itemId}/draft-request`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone: "professional" }),
      },
    ),

  createMonitor: (projectId: string, itemId: string, frequency = "1d") =>
    request<MonitorRecord>(`/api/projects/${projectId}/items/${itemId}/monitor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frequency }),
    }),

  listMonitors: (projectId: string) =>
    request<{ monitors: MonitorRecord[] }>(`/api/projects/${projectId}/monitors`),

  ask: (projectId: string, question: string, sessionId?: string) =>
    request<{ answer: string; session_id: string }>(`/api/projects/${projectId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, session_id: sessionId }),
    }),

  packetUrl: (projectId: string) => `/api/projects/${projectId}/packet.md`,
  cutUrl: (projectId: string) => `/api/projects/${projectId}/cut`,
};

export interface PreflightError {
  code: "unsupported_type" | "too_large" | "no_text_layer" | "unreadable_container" | string;
  message: string;
}

export interface PreflightResult {
  kind: "screenplay" | "cut" | "unknown";
  filename: string;
  mime_type: string;
  size_bytes: number;
  accepted: boolean;
  details: Record<string, unknown>;
  errors: PreflightError[];
}

export interface SearchResultFrame {
  type: "search_results";
  item_id: string;
  item_name: string;
  sources: { url: string; title: string | null; excerpt: string }[];
}

export type StreamFrame =
  | { type: "snapshot"; project: Project }
  | { type: "progress"; phase: string; message: string; detail: Record<string, unknown> }
  | SearchResultFrame
  | { type: "search_failed"; item_id: string; message: string }
  | { type: "item_status"; item_id: string; status: string; color?: string }
  | {
      type: "item_researched";
      item_id: string;
      item_name: string;
      status: string;
      color: string;
      citations: number;
      holders: number;
    }
  | { type: "monitor_event"; monitor_id: string; item_id: string; item_name: string }
  | { type: "done"; phase: string }
  | { type: "error"; phase: string; message: string };

export function streamProject(
  projectId: string,
  onFrame: (frame: StreamFrame) => void,
): () => void {
  const source = new EventSource(`/api/projects/${projectId}/stream`);
  source.onmessage = (event) => {
    if (!event.data) return;
    try {
      onFrame(JSON.parse(event.data) as StreamFrame);
    } catch {
      // Keepalive comments and malformed frames are safe to ignore.
    }
  };
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) {
      onFrame({
        type: "error",
        phase: "failed",
        message: "Connection to the server was lost.",
      });
    }
  };
  return () => source.close();
}
