import { extname } from "node:path";

import type { Hono } from "hono";
import { z } from "zod";

import type { CutVersion, ScriptVersion } from "@clearcut/contracts";
import {
  applyRevision,
  ensureInitialRevision,
  RevisionComparisonError,
  RevisionConflictError,
} from "@clearcut/domain";

import type { ApiDependencies, ClearCutEnv } from "../context";
import { ApiProblem } from "../middleware/errors";
import { audit } from "../services/items";
import { withSummary } from "../services/projects";
import { processingRevision, revisionSummary } from "../services/revisions";
import { preflightFile } from "../services/uploads";

function assetKey(projectId: string, kind: "script" | "cut", filename: string): string {
  const suffix = extname(filename).toLocaleLowerCase().replace(/[^.a-z0-9]/g, "");
  return `projects/${projectId}/revisions/${kind}/${crypto.randomUUID()}${suffix}`;
}

export function registerRevisionRoutes(app: Hono<ClearCutEnv>, dependencies: ApiDependencies) {
  app.get("/api/projects/:projectId/revisions", async (context) => {
    const project = await dependencies.repository.require(context.req.param("projectId"));
    if (project.revisions.length === 0 && project.phase === "ready") {
      ensureInitialRevision(project);
      await dependencies.repository.save(project);
    }
    return context.json({
      active_revision_id: project.active_revision_id,
      revisions: [...project.revisions].sort((left, right) => left.sequence - right.sequence).map(revisionSummary),
    });
  });

  app.get("/api/projects/:projectId/revisions/:revisionId", async (context) => {
    const project = await dependencies.repository.require(context.req.param("projectId"));
    const revision = project.revisions.find((candidate) => candidate.id === context.req.param("revisionId"));
    if (!revision) throw new ApiProblem(404, "revision_not_found", "Revision not found.");
    return context.json(revision);
  });

  app.post("/api/projects/:projectId/revisions", async (context) => {
    const body = await context.req.parseBody();
    const scriptFile = body.script instanceof File ? body.script : null;
    const cutFile = body.cut instanceof File ? body.cut : null;
    if (!scriptFile && !cutFile) {
      throw new ApiProblem(400, "revision_asset_required", "Upload a revised screenplay, cut, or both.");
    }
    const project = await dependencies.repository.require(context.req.param("projectId"));
    if (project.revisions.length === 0) ensureInitialRevision(project);
    if (!project.active_revision_id) {
      throw new ApiProblem(409, "revision_snapshot_missing", "The active project has no revision snapshot.");
    }
    const [scriptPreflight, cutPreflight] = await Promise.all([
      scriptFile ? preflightFile(scriptFile, dependencies.config) : null,
      cutFile ? preflightFile(cutFile, dependencies.config) : null,
    ]);
    for (const result of [scriptPreflight, cutPreflight]) {
      if (result && !result.accepted) {
        const error = result.errors[0];
        throw new ApiProblem(error.code === "too_large" ? 413 : 400, error.code, error.message);
      }
    }
    if (scriptPreflight && scriptPreflight.kind !== "screenplay") {
      throw new ApiProblem(400, "invalid_revision_script", "The revised screenplay is not a screenplay document.");
    }
    if (cutPreflight && cutPreflight.kind !== "cut") {
      throw new ApiProblem(400, "invalid_revision_cut", "The revised cut is not a video container.");
    }

    const stored: string[] = [];
    try {
      let script: ScriptVersion | null = structuredClone(project.script);
      let cut: CutVersion | null = structuredClone(project.cut);
      const timestamp = new Date().toISOString();
      if (scriptFile && scriptPreflight) {
        const asset = await dependencies.assetStore.put(scriptFile.stream(), {
          key: assetKey(project.id, "script", scriptFile.name),
          filename: scriptFile.name,
          contentType: scriptFile.type || "application/octet-stream",
          sizeBytes: scriptFile.size,
        });
        stored.push(asset.key);
        script = {
          id: `script_${crypto.randomUUID()}`,
          label: `script-v${Math.max(project.script_history.length, project.script ? 1 : 0) + 1}`,
          filename: asset.filename,
          title: String(scriptPreflight.details.title ?? ""),
          page_count: Number(scriptPreflight.details.page_count ?? 0),
          scene_count: Number(scriptPreflight.details.scene_count ?? 0),
          storage_key: asset.key,
          mime_type: asset.contentType,
          size_bytes: asset.sizeBytes,
          uploaded_at: timestamp,
        };
      }
      if (cutFile && cutPreflight) {
        const asset = await dependencies.assetStore.put(cutFile.stream(), {
          key: assetKey(project.id, "cut", cutFile.name),
          filename: cutFile.name,
          contentType: cutFile.type || "video/mp4",
          sizeBytes: cutFile.size,
        });
        stored.push(asset.key);
        cut = {
          id: `cut_${crypto.randomUUID()}`,
          label: `rough-cut-v${Math.max(project.cut_history.length, project.cut ? 1 : 0) + 1}`,
          filename: asset.filename,
          duration_s: Number(cutPreflight.details.duration_s ?? 0),
          storage_key: asset.key,
          mime_type: asset.contentType,
          size_bytes: asset.sizeBytes,
          gcs_uri: null,
          media_url: `/api/projects/${project.id}/cut`,
          uploaded_at: timestamp,
        };
      }
      const revision = processingRevision({
        sequence: Math.max(...project.revisions.map((candidate) => candidate.sequence)) + 1,
        script,
        cut,
        predecessorId: project.active_revision_id,
      });
      project.revisions.push(revision);
      project.audit_events.push(audit({
        actor: "coordinator",
        action: "revision_uploaded",
        rationale: `Revision ${revision.sequence} uploaded for comparison.`,
        sourceVersion: cut?.label ?? script?.label ?? "",
        detail: { revision_id: revision.id, predecessor_id: revision.predecessor_id },
      }));
      project.updated_at = timestamp;
      await dependencies.repository.save(project);
      if (dependencies.jobRunner.startRevision) {
        queueMicrotask(() => void Promise.resolve(dependencies.jobRunner.startRevision?.(project.id, revision.id)).catch(() => undefined));
      }
      return context.json(revision, 201);
    } catch (error) {
      await Promise.all(stored.map((key) => dependencies.assetStore.delete(key)));
      throw error;
    }
  });

  app.post("/api/projects/:projectId/revisions/:revisionId/apply", async (context) => {
    const input = z.object({ predecessor_id: z.string().nullable() }).strict().parse(await context.req.json());
    const project = await dependencies.repository.require(context.req.param("projectId"));
    try {
      const result = applyRevision(project, context.req.param("revisionId"), input.predecessor_id);
      await dependencies.repository.save(withSummary(result.project));
      return context.json({ ...result, project: withSummary(result.project) });
    } catch (error) {
      if (error instanceof RevisionConflictError) throw error;
      if (error instanceof RevisionComparisonError) {
        throw new ApiProblem(error.message.toLocaleLowerCase().includes("not found") ? 404 : 409, error.code, error.message);
      }
      throw error;
    }
  });
}
