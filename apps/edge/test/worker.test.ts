import { describe, expect, test } from "bun:test";

import { createEdgeWorker } from "../src/worker";

function environment(response: Response) {
  const requests: Request[] = [];
  const names: string[] = [];
  return {
    requests,
    names,
    env: {
      CLEARCUT_API: {
        getByName(name: string) {
          names.push(name);
          return { fetch: async (request: Request) => { requests.push(request); return response; } };
        },
      },
    },
  };
}

describe("Cloudflare edge gateway", () => {
  test("public requests cannot call the internal binding origin", async () => {
    const runtime = environment(new Response("should not run"));
    const response = await createEdgeWorker().fetch(
      new Request("https://app.test/api/__bindings/projects"),
      runtime.env as never,
    );
    expect(response.status).toBe(404);
    expect(runtime.requests).toHaveLength(0);
  });

  test("forwards the exact request to one stable named container", async () => {
    const runtime = environment(Response.json({ ok: true }));
    const controller = new AbortController();
    const response = await createEdgeWorker().fetch(new Request("https://app.test/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "request-1" },
      body: JSON.stringify({ title: "Night Drive" }),
      signal: controller.signal,
    }), runtime.env as never);

    expect(response.status).toBe(200);
    expect(runtime.names).toEqual(["clearcut-api-primary"]);
    expect(runtime.requests[0].method).toBe("POST");
    expect(JSON.parse(await runtime.requests[0].text())).toEqual({ title: "Night Drive" });
    expect(runtime.requests[0].headers.get("x-forwarded-host")).toBe("app.test");
    expect(runtime.requests[0].headers.get("x-forwarded-proto")).toBe("https");
    expect(runtime.requests[0].signal).toBe(controller.signal);
  });

  test("SSE passes through without buffering and disables caching", async () => {
    const containerStream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("data: ready\n\n")); } });
    const runtime = environment(new Response(containerStream, { headers: { "content-type": "text/event-stream" } }));
    const response = await createEdgeWorker().fetch(
      new Request("https://app.test/api/projects/project-1/stream"),
      runtime.env as never,
    );
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.body).toBe(containerStream);
  });
});
