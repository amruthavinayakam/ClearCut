import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

import { installFixtureApi } from "./fixtures";


async function expectAccessible(page: Page, include?: string) {
  const builder = new AxeBuilder({ page });
  if (include) builder.include(include);
  const result = await builder.analyze();
  const serious = result.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical"
  );
  expect(serious, serious.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
}

test("core routes have no serious or critical accessibility violations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const state = await installFixtureApi(page);
  for (const path of [
    "/",
    "/projects/new",
    `/projects/${state.project.id}`,
    `/projects/${state.project.id}/revisions/${state.candidateRevision.id}`,
    `/projects/${state.project.id}/packet`,
  ]) {
    await page.goto(path);
    await page.locator("main").waitFor();
    await expectAccessible(page);
  }
});

test("document sheet, confirmation dialogs, and timeline controls are named and restore focus", async ({ page }) => {
  await installFixtureApi(page);
  await page.goto("/projects/proj_fixture?item=item_art");

  const trigger = page.getByRole("button", { name: "Documents · 0" });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: /Documents · Harbor Lights/i })).toBeVisible();
  await expectAccessible(page, ".drawer");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByLabel("Notes")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /Close Documents/i })).toBeFocused();
  await page.getByRole("button", { name: /Close Documents/i }).click();
  await expect(trigger).toBeFocused();

  await page.getByRole("button", { name: "Record verification" }).click();
  const dialog = page.getByRole("dialog", { name: "Record coordinator verification" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Rationale")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Record verification" })).toBeFocused();

  await expect(page.getByRole("button", { name: /Harbor Lights, 1961 at 00:12/i })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Evidence ready").last()).toBeVisible();
});

test("all essential content remains in flow without horizontal overflow", async ({ page }) => {
  await installFixtureApi(page);
  for (const viewport of [{ width: 1024, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const path of ["/", "/projects/new", "/projects/proj_fixture", "/projects/proj_fixture/packet"]) {
      await page.goto(path);
      await page.locator("main").waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  }
});

test("fonts stay local and motion settles without layout-property animation", async ({ page }) => {
  const externalFontRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() !== "font") return;
    const url = new URL(request.url());
    if (url.hostname !== "clearcut-frontend.lcl") externalFontRequests.push(request.url());
  });
  await installFixtureApi(page);
  await page.goto("/projects/proj_fixture?item=item_art");
  await page.waitForTimeout(700);

  expect(externalFontRequests).toEqual([]);
  const running = await page.evaluate(() => document.getAnimations()
    .filter((animation) => animation.playState === "running")
    .map((animation) => animation.effect?.getTiming().iterations));
  expect(running).toEqual([]);

  const motionCss = readFileSync(new URL("../../src/styles/motion.css", import.meta.url), "utf8");
  expect(motionCss).not.toMatch(/(?:transition|animation)[^;{}]*(?:width|height|top|right|bottom|left|margin|padding)/i);
});
