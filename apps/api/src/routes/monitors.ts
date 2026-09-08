import type { Hono } from "hono";
import { z } from "zod";

import type { AuditEvent } from "@clearcut/contracts";

import type { ApiDependencies, ClearCutEnv } from "../context";
import { ApiProblem } from "../middleware/errors";
import { requireWebhookSecret } from "../middleware/webhook-auth";
import { audit, requireItem } from "../services/items";
import { withSummary } from "../services/projects";

const MonitorCreateSchema = z.object({ frequency: z.enum(["1h", "1d", "1w"]).default("1d") }).strict();
const WebhookSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  data: z.object({ monitor_id: z.string().optional() }).passthrough().default({}),
}).passthrough();

export function registerMonitorRoutes(app: Hono<ClearCutEnv>, dependencies: ApiDependencies) {
  app.post("/api/projects/:projectId/items/:itemId/monitor", async (context) => {
    const input = MonitorCreateSchema.parse(await context.req.json());
    const project = await dependencies.repository.require(context.req.param("projectId"));
    const item = requireItem(project, context.req.param("itemId"));
    const existing = item.monitor_id ? await dependencies.monitors.get(item.monitor_id) : null;
    if (existing) return context.json(existing);
    const monitor = await dependencies.parallel.createMonitor(item, project.title, project.id, input.frequency);
    await dependencies.monitors.save(monitor);
    item.monitor_id = monitor.monitor_id;
    item.audit_events.push(audit({
      actor: "coordinator",
      action: "monitor_opened",
      rationale: `Watching for public changes every ${input.frequency}.`,
      sourceVersion: item.source_version,
      detail: { monitor_id: monitor.monitor_id },
    }));
    project.updated_at = new Date().toISOString();
    await dependencies.repository.save(withSummary(project));
    return context.json(monitor, 201);
  });

  app.get("/api/projects/:projectId/monitors", async (context) => {
    await dependencies.repository.require(context.req.param("projectId"));
    return context.json({ monitors: await dependencies.monitors.listForProject(context.req.param("projectId")) });
  });

  app.get("/api/monitors/:monitorId/events", async (context) => {
    const monitor = await dependencies.monitors.get(context.req.param("monitorId"));
    if (!monitor) throw new ApiProblem(404, "monitor_not_found", "Monitor not found.");
    monitor.events = await dependencies.parallel.readMonitorEvents(monitor.monitor_id);
    await dependencies.monitors.save(monitor);
    return context.json({ monitor_id: monitor.monitor_id, events: monitor.events });
  });

  app.post("/api/webhooks/parallel", async (context) => {
    requireWebhookSecret(context.req.header("x-radar-secret") ?? "", dependencies.config.webhookSecret);
    const payload = WebhookSchema.parse(await context.req.json());
    const monitorId = payload.data.monitor_id;
    if (!monitorId) return context.json({ ok: true, ignored: "no_monitor_id" });
    const monitor = await dependencies.monitors.get(monitorId);
    if (!monitor) return context.json({ ok: true, ignored: "unknown_monitor" });
    const deliveryId = payload.id ?? `${payload.type ?? "monitor.event.detected"}:${monitorId}`;
    if (await dependencies.monitors.hasDelivery(deliveryId)) return context.json({ ok: true, duplicate: true });

    monitor.events = await dependencies.parallel.readMonitorEvents(monitorId);
    await dependencies.monitors.save(monitor);
    const project = await dependencies.repository.get(monitor.project_id);
    if (project) {
      const item = project.items.find((candidate) => candidate.id === monitor.item_id);
      if (item && item.workflow_status !== "reopened_by_monitor") {
        const event: AuditEvent = audit({
          actor: "agent",
          action: "monitor_reopened",
          rationale: "Parallel Monitor reported a public change affecting this item.",
          sourceVersion: item.source_version,
          detail: { monitor_id: monitorId, delivery_id: deliveryId },
        });
        event.from_status = item.workflow_status;
        event.to_status = "reopened_by_monitor";
        item.workflow_status = "reopened_by_monitor";
        item.color = "red";
        item.is_resolved = false;
        item.audit_events.push(event);
        project.updated_at = new Date().toISOString();
        await dependencies.repository.save(withSummary(project));
      }
      dependencies.events.publish(project.id, {
        type: "monitor_event",
        monitor_id: monitorId,
        item_id: monitor.item_id,
        item_name: monitor.item_name,
      });
    }
    await dependencies.monitors.recordDelivery(deliveryId);
    return context.json({ ok: true });
  });
}
