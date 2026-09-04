import { ApiErrorSchema, ProjectSchema, type PreflightResult, type Project } from "@clearcut/contracts";

import { ApiClientError, apiRequest, preflightFile } from "@/lib/api-client";

export type ProjectUploadInput = {
  title: string;
  screenplay: File | null;
  cut: File | null;
  onProgress?: (progress: number) => void;
};

export interface UploadClient {
  preflight(file: File): Promise<PreflightResult>;
  createProject(input: ProjectUploadInput): Promise<Project>;
  createSampleProject(): Promise<Project>;
}

async function readJson(xhr: XMLHttpRequest): Promise<unknown> {
  if (typeof xhr.response === "object" && xhr.response !== null) return xhr.response;
  return JSON.parse(xhr.responseText || "null") as unknown;
}

export const browserUploadClient: UploadClient = {
  preflight: preflightFile,
  createSampleProject() {
    return apiRequest("/api/projects/sample", ProjectSchema, { method: "POST" });
  },
  createProject(input) {
    return new Promise((resolve, reject) => {
      const body = new FormData();
      body.set("title", input.title.trim() || "Untitled production");
      if (input.screenplay) body.set("script", input.screenplay);
      if (input.cut) body.set("cut", input.cut);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/projects");
      xhr.responseType = "json";
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) input.onProgress?.(Math.round((event.loaded / event.total) * 100));
      });
      xhr.addEventListener("error", () => reject(new ApiClientError("The upload connection failed.", "network_error")));
      xhr.addEventListener("load", async () => {
        try {
          const data = await readJson(xhr);
          if (xhr.status >= 200 && xhr.status < 300) return resolve(ProjectSchema.parse(data));
          const problem = ApiErrorSchema.safeParse(data);
          reject(problem.success
            ? new ApiClientError(problem.data.message, problem.data.code, problem.data.request_id)
            : new ApiClientError("The project could not be created.", "request_failed"));
        } catch {
          reject(new ApiClientError("The server returned an unreadable response.", "invalid_response"));
        }
      });
      xhr.send(body);
    });
  },
};
