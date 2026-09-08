import type { Hono } from "hono";
import { recordPacketExport } from "@clearcut/domain";

import type { ApiDependencies, ClearCutEnv } from "../context";
import { packetMarkdown } from "../services/packets";

function filename(title: string): string {
  const safe = title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `clearance-packet-${safe || "production"}.md`;
}

export function registerPacketRoutes(app: Hono<ClearCutEnv>, dependencies: ApiDependencies) {
  app.get("/api/projects/:projectId/packet.md", async (context) => {
    const project = await dependencies.repository.require(context.req.param("projectId"));
    return context.text(packetMarkdown(project), 200, { "content-type": "text/markdown; charset=utf-8" });
  });

  app.post("/api/projects/:projectId/packet-exports", async (context) => {
    const project = await dependencies.repository.require(context.req.param("projectId"));
    const changed = recordPacketExport(project, context.get("requestId"));
    await dependencies.repository.save(changed);
    return context.text(packetMarkdown(changed), 200, {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${filename(changed.title)}"`,
    });
  });
}
