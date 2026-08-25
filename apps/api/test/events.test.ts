import { describe, expect, test } from "bun:test";

import { ProjectEventBus } from "../src/services/events";

describe("project event bus", () => {
  test("uses monotonic ids and replays only events after the requested id", () => {
    const bus = new ProjectEventBus();
    const first = bus.publish("project-1", {
      type: "progress",
      phase: "scanning_script",
      message: "Reading screenplay",
      detail: {},
    });
    const second = bus.publish("project-1", { type: "done", phase: "ready" });

    expect(second.id).toBe(first.id + 1);
    expect(bus.snapshotSince("project-1", first.id)).toEqual([second]);
  });

  test("subscriber receives future events and can detach", async () => {
    const bus = new ProjectEventBus();
    const subscription = bus.subscribe("project-1");
    const pending = subscription.next();
    const published = bus.publish("project-1", { type: "heartbeat", at: new Date().toISOString() });
    expect((await pending).value).toEqual(published);
    subscription.close();
    expect(await subscription.next()).toEqual({ done: true, value: undefined });
  });
});
