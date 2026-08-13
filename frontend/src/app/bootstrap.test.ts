import { describe, expect, it, vi } from "vitest";

import { bootstrap } from "./bootstrap";


describe("bootstrap", () => {
  it("keeps the project index usable when configuration fails", async () => {
    const client = {
      config: vi.fn().mockRejectedValue(new Error("configuration unavailable")),
      listProjects: vi.fn().mockResolvedValue({ projects: [] }),
    };

    const result = await bootstrap(client);

    expect(result.config.status).toBe("error");
    expect(result.projects).toEqual({ status: "ready", data: [] });
  });

  it("keeps configuration usable when the project index fails", async () => {
    const config = { sample_available: true };
    const client = {
      config: vi.fn().mockResolvedValue(config),
      listProjects: vi.fn().mockRejectedValue(new Error("index unavailable")),
    };

    const result = await bootstrap(client);

    expect(result.config).toEqual({ status: "ready", data: config });
    expect(result.projects.status).toBe("error");
  });
});
