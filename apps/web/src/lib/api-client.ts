import {
  ApiErrorSchema,
  AppConfigSchema,
  PreflightResultSchema,
  ProjectListSchema,
  ProjectSchema,
  type AppConfig,
  type PreflightResult,
  type Project,
  type ProjectListItem,
} from "@clearcut/contracts";

const serverOrigin = process.env.CLEARCUT_API_ORIGIN ?? "https://clearcut-api.lcl";

function endpoint(path: string) {
  if (typeof window !== "undefined") return path;
  return `${serverOrigin}${path}`;
}

/**
 * True when the API said the thing does not exist.
 *
 * The API names the resource in the code — project_not_found, item_not_found —
 * so a check against the bare "not_found" matches only the router's own
 * fallback. A page relying on that rendered a runtime error instead of a 404.
 */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiClientError && /(^|_)not_found$/.test(error.code);
}

/**
 * The response body, or null when it is not JSON.
 *
 * A failure between the browser and the API — an upload cut short, a proxy
 * timeout, a payload the platform rejects — comes back as an HTML error page.
 * Parsing that as JSON put `Unexpected token '<', "<!DOCTYPE "...` under the
 * file in the upload dialog, which says nothing about the file or what to do.
 */
export async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** What to say when the failure never reached the API's own error handler. */
export function transportMessage(status: number): string {
  if (status === 413) return "That file is too large to upload.";
  if (status === 408 || status === 504) return "The upload timed out before it finished. Try again.";
  if (status === 502 || status === 503) return "The server was unreachable. Try again in a moment.";
  return `The request failed with status ${status}.`;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, schema: { parse(value: unknown): T }, init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint(path), { cache: "no-store", ...init });
  const body = await readJsonBody(response);
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    if (parsed.success) throw new ApiClientError(parsed.data.message, parsed.data.code, parsed.data.request_id);
    throw new ApiClientError(transportMessage(response.status), "request_failed");
  }
  if (body === null) throw new ApiClientError(transportMessage(response.status), "unreadable_response");
  return schema.parse(body);
}

export async function apiTextRequest(path: string, init?: RequestInit): Promise<string> {
  const response = await fetch(endpoint(path), { cache: "no-store", ...init });
  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    try {
      const problem = ApiErrorSchema.safeParse(await readJsonBody(response));
      if (problem.success) message = problem.data.message;
      else message = transportMessage(response.status);
    } catch {
      // The text boundary may not return JSON for upstream failures.
    }
    throw new ApiClientError(message, "request_failed");
  }
  return response.text();
}

export function getConfig(): Promise<AppConfig> {
  return apiRequest("/api/config", AppConfigSchema);
}

export async function listProjects(includeArchived = false): Promise<ProjectListItem[]> {
  const result = await apiRequest(`/api/projects${includeArchived ? "?include_archived=true" : ""}`, ProjectListSchema);
  return result.projects;
}

export function getProject(projectId: string): Promise<Project> {
  return apiRequest(`/api/projects/${encodeURIComponent(projectId)}`, ProjectSchema);
}

export async function preflightFile(file: File): Promise<PreflightResult> {
  const body = new FormData();
  body.set("file", file);
  return apiRequest("/api/uploads/preflight", PreflightResultSchema, { method: "POST", body });
}
