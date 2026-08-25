import { Hono } from "hono";

import type { ApiDependencies, ClearCutEnv } from "./context";
import { errorResponse } from "./middleware/errors";
import { requestId } from "./middleware/request-id";
import { registerAssetRoutes } from "./routes/assets";
import { registerProjectRoutes } from "./routes/projects";
import { registerSystemRoutes } from "./routes/system";
import { registerUploadRoutes } from "./routes/uploads";

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
  return app;
}
