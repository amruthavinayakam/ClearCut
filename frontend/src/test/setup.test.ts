import { describe, expect, it } from "vitest";

describe("frontend test environment", () => {
  it("provides a browser document for interaction tests", () => {
    const button = document.createElement("button");
    button.textContent = "Review evidence";
    document.body.append(button);

    expect(document.querySelector("button")?.textContent).toBe("Review evidence");
  });
});
