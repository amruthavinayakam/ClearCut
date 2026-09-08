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

  test("video probe reports a positive duration", async () => {
    const result = await probeVideo(join(media, "the_long_way_down_roughcut.mp4"));
    expect(result.durationSeconds).toBeGreaterThan(0);
  });
});
