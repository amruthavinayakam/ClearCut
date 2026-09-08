import type { Hono } from "hono";

import type { ApiDependencies, ClearCutEnv } from "../context";
import { ApiProblem } from "../middleware/errors";
import { preflightFile } from "../services/uploads";

export function registerUploadRoutes(app: Hono<ClearCutEnv>, dependencies: ApiDependencies) {
  app.post("/api/uploads/preflight", async (context) => {
    const body = await context.req.parseBody();
    if (!(body.file instanceof File)) {
      throw new ApiProblem(422, "file_required", "Choose a file to preflight.");
    }
    return context.json(await preflightFile(body.file, dependencies.config));
  });
}
