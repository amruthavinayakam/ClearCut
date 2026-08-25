import type { Hono } from "hono";

import {
  CoordinationChangeSchema,
  StatusChangeSchema,
  UseProfileChangeSchema,
} from "@clearcut/contracts";
import { applyDisposition, assessScope } from "@clearcut/domain";

import type { ApiDependencies, ClearCutEnv } from "../context";
import { audit, requireItem } from "../services/items";
import { withSummary } from "../services/projects";

export function registerItemRoutes(app: Hono<ClearCutEnv>, dependencies: ApiDependencies) {
  app.post("/api/projects/:projectId/items/:itemId/status", async (context) => {
    const input = StatusChangeSchema.parse(await context.req.json());
    const project = await dependencies.repository.require(context.req.param("projectId"));
    const item = requireItem(project, context.req.param("itemId"));
    const changed = applyDisposition(item, input);
    const index = project.items.findIndex((candidate) => candidate.id === item.id);
    project.items[index] = changed;
    project.updated_at = new Date().toISOString();
    await dependencies.repository.save(withSummary(project));
    return context.json({
      item_id: changed.id,
      status: changed.workflow_status,
      event: changed.audit_events.at(-1) ?? null,
    });
  });

  app.patch("/api/projects/:projectId/items/:itemId/coordination", async (context) => {
    const input = CoordinationChangeSchema.parse(await context.req.json());
    const project = await dependencies.repository.require(context.req.param("projectId"));
    const item = requireItem(project, context.req.param("itemId"));
    item.assigned_to = input.assigned_to.trim();
    item.audit_events.push(audit({
      actor: "coordinator",
      actorName: item.assigned_to,
      action: "assignment_changed",
      rationale: item.assigned_to ? `Assigned to ${item.assigned_to}.` : "Assignment cleared.",
      sourceVersion: item.source_version,
    }));
    project.updated_at = new Date().toISOString();
    await dependencies.repository.save(project);
    return context.json({ item_id: item.id, assigned_to: item.assigned_to });
  });

  app.patch("/api/projects/:projectId/use-profile", async (context) => {
    const input = UseProfileChangeSchema.parse(await context.req.json());
    const project = await dependencies.repository.require(context.req.param("projectId"));
    project.use_profile = input;
    project.updated_at = new Date().toISOString();
    project.audit_events.push(audit({
      actor: "coordinator",
      action: "intended_use_updated",
      rationale: "Updated the production's intended-use comparison profile.",
      sourceVersion: project.cut?.label ?? project.script?.label ?? "",
      detail: input,
    }));
    await dependencies.repository.save(project);
    return context.json({
      use_profile: input,
      assessments: Object.fromEntries(project.items.map((item) => [
        item.id,
        Object.fromEntries(item.documents.map((document) => [document.id, assessScope(input, {
          media: document.media,
          territories: document.territories,
          starts_on: document.starts_on,
          ends_on: document.ends_on,
          perpetual: document.perpetual,
          covered_use: document.covered_use,
        })])),
      ])),
    });
  });
}
