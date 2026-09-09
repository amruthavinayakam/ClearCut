import type { NextRequest } from "next/server";

/**
 * Same-origin `/api/*` proxy to the Bun API service.
 *
 * The browser always calls a relative `/api/...` path (see lib/api-client.ts),
 * but in production the API is a separate Cloud Run service. Next's own
 * `rewrites()` proxy is not usable here: it buffers `text/event-stream` bodies,
 * which would break the live pipeline feed, and in a standalone build it
 * currently fails against an absolute external origin. Passing `upstream.body`
 * straight through keeps the SSE stream intact.
 *
 * In development the next.config rewrite handles `/api/*` against the local
 * Portless origin, so this handler only carries production traffic.
 */

const API_ORIGIN = process.env.CLEARCUT_API_ORIGIN ?? "https://clearcut-api.lcl";

/** Hop-by-hop and length headers the runtime must recompute itself. */
const STRIPPED = new Set(["host", "connection", "content-length", "transfer-encoding", "accept-encoding"]);

function forwardHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIPPED.has(key.toLowerCase())) headers.set(key, value);
  });
  return headers;
}

async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  const target = `${API_ORIGIN.replace(/\/$/, "")}/api/${path.join("/")}${request.nextUrl.search}`;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  const upstream = await fetch(target, {
    method: request.method,
    headers: forwardHeaders(request),
    body: hasBody ? request.body : undefined,
    // Required by undici when streaming a request body rather than buffering it.
    ...(hasBody ? { duplex: "half" as const } : {}),
    redirect: "manual",
    signal: request.signal,
  });

  const headers = new Headers(upstream.headers);
  // The runtime decompressed the upstream body, so whatever encoding it named
  // no longer describes what is about to be sent, and the length no longer
  // matches either.
  headers.delete("content-encoding");
  headers.delete("content-length");

  // Compress on the way out. A clearance record is 1.6MB of research prose for
  // a 70-case production, and shipping it raw through this hop was the bulk of
  // the fifteen seconds it took to open one. Event streams are left alone:
  // compressing them buffers the events whose whole point is arriving live.
  const stream = upstream.body;
  const isEventStream = (upstream.headers.get("content-type") ?? "").includes("text/event-stream");
  const acceptsGzip = (request.headers.get("accept-encoding") ?? "").includes("gzip");
  if (stream && acceptsGzip && !isEventStream) {
    headers.set("content-encoding", "gzip");
    headers.append("vary", "accept-encoding");
    return new Response(stream.pipeThrough(new CompressionStream("gzip")), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }

  return new Response(stream, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

type Context = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return proxy(request, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;

// Streaming passthrough needs the Node runtime, and the proxy must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
