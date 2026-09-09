import { Hono } from "hono";
import { compress } from "hono/compress";

import type { ApiDependencies, ClearCutEnv } from "./context";
import { errorResponse } from "./middleware/errors";
import { requestId } from "./middleware/request-id";
import { registerAssetRoutes } from "./routes/assets";
import { registerDocumentRoutes } from "./routes/documents";
import { registerItemRoutes } from "./routes/items";
import { registerPacketRoutes } from "./routes/packets";
import { registerProjectRoutes } from "./routes/projects";
import { registerRevisionRoutes } from "./routes/revisions";
import { registerSystemRoutes } from "./routes/system";
import { registerUploadRoutes } from "./routes/uploads";
import { registerMonitorRoutes } from "./routes/monitors";
import { registerChatRoutes } from "./routes/chat";
import { registerStreamRoutes } from "./routes/stream";

export type { ApiDependencies } from "./context";

export function createApp(dependencies: ApiDependencies) {
  const app = new Hono<ClearCutEnv>();
  app.use("*", requestId);
  // A clearance record is mostly research prose, which compresses about four to
  // one: a 70-case production is 1.6MB of JSON and took six seconds to fetch
  // over a normal connection, nearly all of it transfer rather than work. The
  // progress stream is excluded — compressing an event stream buffers it, and
  // the whole point of that endpoint is that events arrive as they happen.
  app.use("*", async (context, next) => {
    if (context.req.path.endsWith("/stream")) return next();
    return compress()(context, next);
  });
  app.notFound((context) => context.json({
    code: "not_found",
    message: "The requested API resource does not exist.",
    request_id: context.get("requestId"),
  }, 404));
  app.onError(errorResponse);
  registerSystemRoutes(app, dependencies);
  registerUploadRoutes(app, dependencies);
  registerProjectRoutes(app, dependencies);
  registerAssetRoutes(app, dependencies);
  registerItemRoutes(app, dependencies);
  registerDocumentRoutes(app, dependencies);
  registerPacketRoutes(app, dependencies);
  registerRevisionRoutes(app, dependencies);
  registerMonitorRoutes(app, dependencies);
  registerChatRoutes(app, dependencies);
  registerStreamRoutes(app, dependencies);
  return app;
}
