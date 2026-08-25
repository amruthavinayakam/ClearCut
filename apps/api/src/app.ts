import { Hono } from "hono";

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
