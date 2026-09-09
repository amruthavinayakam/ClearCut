import { describe, expect, it } from "vitest";

import type { ClearanceItem } from "@clearcut/contracts";

import { markScene } from "./script-workspace";

const item = { id: "case_1", name: "Harbor Lights Artwork", color: "amber" } as ClearanceItem;

describe("markScene", () => {
  it("marks an excerpt the page has wrapped over several lines", () => {
    // How a screenplay actually arrives: the sentence the model quoted as prose
    // is broken by the page's own line wrapping.
    const scene = "On the wall, a framed photograph of a harbour at night.\nIt has been there\nlonger than she has.";
    const segments = markScene(scene, [{ item, excerpt: "It has been there longer than she has." }]);

    const marked = segments.filter((segment) => segment.item);
    expect(marked).toHaveLength(1);
    expect(marked[0].text).toBe("It has been there\nlonger than she has.");
    // Nothing is lost: the scene still reads end to end.
    expect(segments.map((segment) => segment.text).join("")).toBe(scene);
  });

  it("leaves the scene intact when the excerpt is not on the page", () => {
    const scene = "A club on a wet street.";
    expect(markScene(scene, [{ item, excerpt: "A line from some other screenplay." }]))
      .toEqual([{ text: scene, item: null }]);
  });
});
