import { createMiddleware } from "hono/factory";

import type { ClearCutEnv } from "../context";

export const requestId = createMiddleware<ClearCutEnv>(async (context, next) => {
  const incoming = context.req.header("x-request-id")?.trim();
  const id = incoming && incoming.length <= 128 ? incoming : `req_${crypto.randomUUID()}`;
  context.set("requestId", id);
  await next();
  context.header("x-request-id", id);
});
