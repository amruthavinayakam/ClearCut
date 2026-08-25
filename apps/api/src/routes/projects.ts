import { extname } from "node:path";

import type { Hono } from "hono";
import { z } from "zod";

import type { ApiDependencies, ClearCutEnv } from "../context";
import { ApiProblem } from "../middleware/errors";
import { createProjectRecord, projectListItem, setArchived, withSummary } from "../services/projects";
import { preflightFile } from "../services/uploads";

function uploadKey(projectId: string, kind: "script" | "cut", filename: string): string {
  const suffix = extname(filename).toLocaleLowerCase().replace(/[^.a-z0-9]/g, "");
  return `projects/${projectId}/${kind}/${crypto.randomUUID()}${suffix}`;
}

async function storeFile(
  dependencies: ApiDependencies,
  projectId: string,
  kind: "script" | "cut",
  file: File,
) {
  return dependencies.assetStore.put(file.stream(), {
    key: uploadKey(projectId, kind, file.name),
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  });
}

export function registerProjectRoutes(app: Hono<ClearCutEnv>, dependencies: ApiDependencies) {
  app.post("/api/projects", async (context) => {
    const body = await context.req.parseBody();
    const script = body.script instanceof File ? body.script : null;
    const cut = body.cut instanceof File ? body.cut : null;
    if (!script && !cut) {
      throw new ApiProblem(400, "input_required", "Upload a screenplay, a rough cut, or both.");
    }
    const title = typeof body.title === "string" ? body.title : "Untitled production";
    const [scriptPreflight, cutPreflight] = await Promise.all([
      script ? preflightFile(script, dependencies.config) : null,
      cut ? preflightFile(cut, dependencies.config) : null,
    ]);
    const rejected = [scriptPreflight, cutPreflight].find((result) => result && !result.accepted);
    if (rejected) {
      const first = rejected.errors[0];
      throw new ApiProblem(first.code === "too_large" ? 413 : 400, first.code, first.message);
    }

    const projectId = `proj_${crypto.randomUUID()}`;
    const stored: string[] = [];
    try {
      const scriptAsset = script ? await storeFile(dependencies, projectId, "script", script) : null;
      if (scriptAsset) stored.push(scriptAsset.key);
      const cutAsset = cut ? await storeFile(dependencies, projectId, "cut", cut) : null;
      if (cutAsset) stored.push(cutAsset.key);
      const project = createProjectRecord({
        id: projectId,
        title,
        scriptAsset,
        scriptDetails: scriptPreflight?.details ?? null,
        cutAsset,
        cutDetails: cutPreflight?.details ?? null,
      });
      const saved = await dependencies.repository.save(project);
      queueMicrotask(() => void Promise.resolve(dependencies.jobRunner.start(saved.id)).catch(() => undefined));
      return context.json(withSummary(saved), 201);
    } catch (error) {
      await Promise.all(stored.map((key) => dependencies.assetStore.delete(key)));
      throw error;
    }
  });

  app.post("/api/projects/sample", async (context) => {
    const script = Bun.file(new URL("../../../../fixtures/media/the_long_way_down.fountain", import.meta.url));
    const cut = Bun.file(new URL("../../../../fixtures/media/the_long_way_down_roughcut.mp4", import.meta.url));
    const body = new FormData();
    body.set("title", "The Long Way Down");
    body.set("script", new File([await script.bytes()], "the_long_way_down.fountain", { type: "text/plain" }));
    body.set("cut", new File([await cut.bytes()], "the_long_way_down_roughcut.mp4", { type: "video/mp4" }));
    const request = new Request(new URL("/api/projects", context.req.url), { method: "POST", body });
    return app.fetch(request);
  });

  app.get("/api/projects", async (context) => {
    const includeArchived = context.req.query("include_archived")?.toLocaleLowerCase() === "true";
    const projects = await dependencies.repository.list({ includeArchived });
    return context.json({ projects: projects.map(projectListItem) });
  });

  app.get("/api/projects/:projectId", async (context) => {
    const project = await dependencies.repository.require(context.req.param("projectId"));
    return context.json(withSummary(project));
  });

  app.patch("/api/projects/:projectId", async (context) => {
    const input = z.object({ archived: z.boolean() }).strict().parse(await context.req.json());
    const project = await dependencies.repository.require(context.req.param("projectId"));
    return context.json(await setArchived(dependencies, project, input.archived));
  });
}
