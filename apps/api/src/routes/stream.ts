import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import type { ApiDependencies, ClearCutEnv } from "../context";

/**
 * SSE channel for an event type.
 *
 * `error` cannot be used: EventSource dispatches its own `error` event for
 * transport failures, with no data attached, so a listener bound to that name
 * receives both and cannot tell them apart.
 */
function channel(type: string): string {
  return type === "error" ? "pipeline_error" : type;
}

export function registerStreamRoutes(app: Hono<ClearCutEnv>, dependencies: ApiDependencies) {
  app.get("/api/projects/:projectId/stream", async (context) => {
    const projectId = context.req.param("projectId");
    const project = await dependencies.repository.require(projectId);
    const headerId = Number(context.req.header("last-event-id") ?? 0);
    const queryId = Number(context.req.query("after") ?? 0);
    const afterId = Number.isInteger(queryId) && queryId > 0 ? queryId : Number.isInteger(headerId) && headerId > 0 ? headerId : 0;

    return streamSSE(context, async (stream) => {
      const subscription = dependencies.events.subscribe(projectId);
      let closed = false;
      stream.onAbort(() => { closed = true; subscription.close(); });
      try {
        const replay = dependencies.events.snapshotSince(projectId, afterId);
        const initial = replay.length > 0
          ? replay
          : [dependencies.events.publish(projectId, { type: "snapshot", project })];
        for (const envelope of initial) {
          await stream.writeSSE({ id: String(envelope.id), event: channel(envelope.event.type), data: JSON.stringify(envelope.event) });
        }
        while (!closed) {
          const next = await Promise.race([
            subscription.next(),
            new Promise<"heartbeat">((resolve) => setTimeout(() => resolve("heartbeat"), 15_000)),
          ]);
          if (next === "heartbeat") {
            const envelope = dependencies.events.publish(projectId, { type: "heartbeat", at: new Date().toISOString() });
            await stream.writeSSE({ id: String(envelope.id), event: "heartbeat", data: JSON.stringify(envelope.event) });
          } else if (next.done) {
            break;
          } else {
            await stream.writeSSE({ id: String(next.value.id), event: channel(next.value.event.type), data: JSON.stringify(next.value.event) });
          }
        }
      } finally {
        subscription.close();
      }
    });
  });
}
