import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectSchema } from "@clearcut/contracts";
import fixture from "../../../../../fixtures/project-ready.json";
import { describe, expect, test, vi } from "vitest";

import { PacketPreview } from "./packet-preview";

describe("packet preview", () => {
  test("does not export until explicit confirmation", async () => {
    const exportPacket = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(<PacketPreview client={{ exportPacket }} initialMarkdown="# Packet" project={ProjectSchema.parse(fixture)} />);

    expect(exportPacket).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm and export Markdown" }));

    expect(screen.getByRole("alertdialog", { name: "Export current packet?" })).toBeVisible();
    expect(exportPacket).not.toHaveBeenCalled();
  });
});
