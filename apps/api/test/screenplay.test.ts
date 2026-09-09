import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { parseScreenplay } from "../src/media/screenplay";
import { probeVideo } from "../src/media/probe";

const media = join(import.meta.dir, "../../../fixtures/media");

describe("screenplay parsing", () => {
  test("fountain parsing preserves scene anchors and title", async () => {
    const path = join(media, "the_long_way_down.fountain");
    const document = await parseScreenplay(await Bun.file(path).bytes(), "the_long_way_down.fountain");

    expect(document.title).toBe("THE LONG WAY DOWN");
    expect(document.scenes.length).toBeGreaterThan(1);
    expect(document.scenes[0].heading).toMatch(/^(INT\.|EXT\.)/);
    expect(document.scenes[0].index).toBe(1);
  });

  test("pdf lines are lines, not the runs the page was drawn from", async () => {
    const path = join(media, "the_long_way_down.pdf");
    const document = await parseScreenplay(await Bun.file(path).bytes(), "the_long_way_down.pdf");
    const lines = document.scenes[0].text.split("\n");

    // One line of a screenplay is several pdf.js runs. Treating each run as a
    // line stranded the opening article of an action paragraph on its own.
    expect(lines).not.toContain("A");
    expect(lines.some((line) => line.startsWith("A one-room walk-up above a laundromat"))).toBe(true);
    // Runs are positioned, not spaced: joined without care they read "Aone-room".
    expect(document.scenes[0].text).not.toMatch(/[a-z][A-Z]/);
  });

  test("video probe reports a positive duration", async () => {
    const result = await probeVideo(join(media, "the_long_way_down_roughcut.mp4"));
    expect(result.durationSeconds).toBeGreaterThan(0);
  });
});
