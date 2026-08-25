export type ContainerStub = { fetch(request: Request): Promise<Response> };
export type ContainerNamespace = { getByName(name: string): ContainerStub };
export type EdgeEnv = { CLEARCUT_API: ContainerNamespace };
import { D1UploadSessionStore, R2UploadObjectStore } from "./bindings";
import { problemResponse } from "./errors";
import { R2Presigner } from "./r2-signer";
import { UploadSessionService } from "./uploads";

export type ProductionEdgeEnv = EdgeEnv & {
  DB: D1Database;
  ASSETS: R2Bucket;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  UPLOAD_ORIGINS: string;
};

const CONTAINER_NAME = "clearcut-api-primary";

export function createEdgeWorker() {
  return {
    async fetch(request: Request, env: EdgeEnv | ProductionEdgeEnv): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/__bindings")) return new Response(null, { status: 404 });
      if (!url.pathname.startsWith("/api/")) return new Response(null, { status: 404 });
      if (url.pathname === "/api/uploads/sessions" || url.pathname.startsWith("/api/uploads/sessions/")) {
        try {
          const production = env as ProductionEdgeEnv;
          const service = new UploadSessionService({
            sessions: new D1UploadSessionStore(production.DB),
            objects: new R2UploadObjectStore(production.ASSETS),
            signer: new R2Presigner({
              accountId: production.R2_ACCOUNT_ID,
              accessKeyId: production.R2_ACCESS_KEY_ID,
              secretAccessKey: production.R2_SECRET_ACCESS_KEY,
              bucket: production.R2_BUCKET_NAME,
            }),
          });
          if (url.pathname === "/api/uploads/sessions" && request.method === "POST") {
            return Response.json(await service.create(await request.json() as never), { status: 201 });
          }
          const match = url.pathname.match(/^\/api\/uploads\/sessions\/([^/]+)\/finalize$/);
          if (match && request.method === "POST") {
            const body = await request.json().catch(() => ({ parts: [] })) as { parts?: Array<{ part_number: number; etag: string }> };
            return Response.json(await service.finalize(decodeURIComponent(match[1]), body.parts ?? []));
          }
          return new Response(null, { status: 404 });
        } catch (error) {
          return problemResponse(error);
        }
      }
      const headers = new Headers(request.headers);
      headers.set("x-forwarded-host", url.host);
      headers.set("x-forwarded-proto", url.protocol.slice(0, -1));
      const forwarded = new Request(request, { headers, signal: request.signal });
      const response = await env.CLEARCUT_API.getByName(CONTAINER_NAME).fetch(forwarded);
      if (!response.headers.get("content-type")?.includes("text/event-stream")) return response;
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("cache-control", "no-store");
      responseHeaders.set("x-accel-buffering", "no");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
    },
  };
}

export default createEdgeWorker();
