import type { Hono } from "hono";

import type { ApiDependencies, ClearCutEnv } from "../context";
import { ApiProblem } from "../middleware/errors";

function parseRange(value: string | undefined, total: number) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) throw new ApiProblem(416, "invalid_asset_range", "Malformed Range header.");
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : total - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= total) {
    throw new ApiProblem(416, "invalid_asset_range", "Range not satisfiable.");
  }
  return { start, end: Math.min(end, total - 1) };
}

export function registerAssetRoutes(app: Hono<ClearCutEnv>, dependencies: ApiDependencies) {
  app.get("/api/projects/:projectId/cut", async (context) => {
    const project = await dependencies.repository.require(context.req.param("projectId"));
    if (!project.cut?.storage_key) throw new ApiProblem(404, "cut_not_found", "No rough cut for this project.");
    const stored = await dependencies.assetStore.stat(project.cut.storage_key);
    const range = parseRange(context.req.header("range"), stored.sizeBytes);
    const asset = await dependencies.assetStore.read(project.cut.storage_key, range ?? undefined);
    return new Response(asset.body, {
      status: range ? 206 : 200,
      headers: {
        "accept-ranges": "bytes",
        "content-length": String(asset.sizeBytes),
        "content-type": project.cut.mime_type || asset.contentType,
        ...(range ? { "content-range": `bytes ${range.start}-${range.end}/${asset.totalSizeBytes}` } : {}),
      },
    });
  });
}
