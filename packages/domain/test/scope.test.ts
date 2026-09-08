import { describe, expect, test } from "bun:test";

import { assessScope } from "../src";

describe("recorded document scope", () => {
  test("reports a missing streaming use as partial", () => {
    expect(assessScope(
      { media: ["theatrical", "streaming"], territories: ["US"], starts_on: null, ends_on: null },
      { media: ["theatrical"], territories: ["US"], starts_on: null, ends_on: null, perpetual: true, covered_use: "" },
    )).toEqual({ outcome: "partial", gaps: ["Streaming is not listed in recorded media."] });
  });

  test("reports expiration before comparing coverage", () => {
    expect(assessScope(
      { media: ["streaming"], territories: ["US"], starts_on: "2027-01-01", ends_on: null },
      { media: ["streaming"], territories: ["US"], starts_on: null, ends_on: "2026-12-31", perpetual: false, covered_use: "" },
    )).toEqual({ outcome: "expired", gaps: ["Recorded term ends before intended use begins."] });
  });

  test("reports absent metadata as unknown", () => {
    expect(assessScope(
      { media: ["broadcast"], territories: ["CA"], starts_on: null, ends_on: null },
      { media: [], territories: [], starts_on: null, ends_on: null, perpetual: false, covered_use: "" },
    )).toEqual({
      outcome: "unknown",
      gaps: ["Recorded media is missing.", "Recorded territories are missing.", "Recorded term is missing."],
    });
  });
});
