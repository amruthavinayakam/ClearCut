import { describe, expect, test } from "bun:test";

import fixture from "../../../fixtures/project-ready.json";
import { ProjectSchema } from "@clearcut/contracts";
import { FixtureGeminiClient, FixtureParallelClient } from "@clearcut/integrations";

import { MemoryMonitorRepository } from "../src/repositories/memory-monitor-repository";
import { ProjectEventBus } from "../src/services/events";
import { createTestApi } from "./test-app";

describe("monitors and copilot", () => {
  test("rejects an invalid webhook secret without mutating the project", async () => {
    const monitors = new MemoryMonitorRepository();
    const parallel = new FixtureParallelClient();
    const events = new ProjectEventBus();
    const api = await createTestApi({ monitors, parallel, events, gemini: new FixtureGeminiClient() });
    await api.repository.save(ProjectSchema.parse(fixture));
    const created = await api.app.request("/api/projects/proj_fixture/items/item_brand/monitor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ frequency: "1d" }),
    });
    const monitor = await created.json() as { monitor_id: string };
    const before = await api.repository.require("proj_fixture");
    const response = await api.app.request("/api/webhooks/parallel", {
      method: "POST",
      headers: { "content-type": "application/json", "x-radar-secret": "wrong" },
      body: JSON.stringify({ data: { monitor_id: monitor.monitor_id } }),
    });

    expect(response.status).toBe(401);
    expect(await api.repository.require("proj_fixture")).toEqual(before);
  });

  test("processes duplicate monitor deliveries idempotently", async () => {
    const monitors = new MemoryMonitorRepository();
    const parallel = new FixtureParallelClient();
    const events = new ProjectEventBus();
    const api = await createTestApi({ monitors, parallel, events, gemini: new FixtureGeminiClient() });
    await api.repository.save(ProjectSchema.parse(fixture));
    const created = await api.app.request("/api/projects/proj_fixture/items/item_brand/monitor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ frequency: "1d" }),
    });
    const monitor = await created.json() as { monitor_id: string };
    const deliver = () => api.app.request("/api/webhooks/parallel", {
      method: "POST",
      headers: { "content-type": "application/json", "x-radar-secret": "test-secret" },
      body: JSON.stringify({ id: "delivery-1", data: { monitor_id: monitor.monitor_id } }),
    });
    expect((await deliver()).status).toBe(200);
    expect((await deliver()).status).toBe(200);
    const item = (await api.repository.require("proj_fixture")).items[0];
    expect(item.workflow_status).toBe("reopened_by_monitor");
    expect(item.audit_events.filter((event) => event.action === "monitor_reopened")).toHaveLength(1);
  });

  test("copilot is read-only", async () => {
    const api = await createTestApi({ gemini: new FixtureGeminiClient() });
    await api.repository.save(ProjectSchema.parse(fixture));
    const before = await api.repository.require("proj_fixture");
    const response = await api.app.request("/api/projects/proj_fixture/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "Can you approve this?" }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).answer).toContain("cannot approve");
    expect(await api.repository.require("proj_fixture")).toEqual(before);
  });
});
