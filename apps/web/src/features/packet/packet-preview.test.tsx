import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectSchema } from "@clearcut/contracts";
import fixture from "../../../../../fixtures/project-ready.json";
import { describe, expect, test, vi } from "vitest";

import { PacketPreview } from "./packet-preview";

describe("packet preview", () => {
  test("does not export until explicit confirmation", async () => {
    const recordExport = vi.fn(async () => undefined);
    const print = vi.fn();
    const user = userEvent.setup();
    render(<PacketPreview client={{ print, recordExport }} initialMarkdown="# Packet" project={ProjectSchema.parse(fixture)} />);

    expect(recordExport).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Export PDF" }));

    expect(screen.getByRole("alertdialog", { name: "Export current packet?" })).toBeVisible();
    expect(recordExport).not.toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
  });

  test("recording the export precedes printing it", async () => {
    const order: string[] = [];
    const recordExport = vi.fn(async () => { order.push("record"); });
    const print = vi.fn(() => { order.push("print"); });
    const user = userEvent.setup();
    render(<PacketPreview client={{ print, recordExport }} initialMarkdown="# Packet" project={ProjectSchema.parse(fixture)} />);

    await user.click(screen.getByRole("button", { name: "Export PDF" }));
    await user.click(screen.getByRole("button", { name: "Export and record" }));

    // The audit event describes the packet the server built, so it has to land
    // even if the print dialog is dismissed.
    expect(order).toEqual(["record", "print"]);
  });
});
