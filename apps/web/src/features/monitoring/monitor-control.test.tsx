import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectSchema, type MonitorRecord } from "@clearcut/contracts";
import fixture from "../../../../../fixtures/project-ready.json";
import { describe, expect, test, vi } from "vitest";

import { MonitorControl } from "./monitor-control";

describe("Parallel Monitor control", () => {
  test("starts one watch and then exposes its active state", async () => {
    const monitor: MonitorRecord = { monitor_id: "mon_1", project_id: "proj_fixture", item_id: "item_brand", item_name: "Northstar Cola", query: "ownership changes", frequency: "1d", status: "active", events: [] };
    const createMonitor = vi.fn(async () => monitor);
    const user = userEvent.setup();
    render(<MonitorControl client={{ createMonitor }} item={ProjectSchema.parse(fixture).items[0]} projectId="proj_fixture" />);

    await user.click(screen.getByRole("button", { name: "Watch for changes" }));

    expect(await screen.findByRole("button", { name: "Monitor active" })).toBeDisabled();
    expect(createMonitor).toHaveBeenCalledTimes(1);
  });
});
