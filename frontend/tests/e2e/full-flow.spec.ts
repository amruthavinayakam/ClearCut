import { expect, test } from "@playwright/test";

import { fixtureState, installFixtureApi } from "./fixtures";


test("first visit creates a project, receives real analysis state, and opens review", async ({ page }) => {
  await installFixtureApi(page);
  await page.goto("/");

  await page.getByRole("link", { name: "New clearance scan" }).click();
  await page.getByRole("textbox", { name: "Production title" }).fill("First Light");
  await page.getByLabel("Choose screenplay").setInputFiles({
    name: "first-light.fountain",
    mimeType: "text/plain",
    buffer: Buffer.from("Title: First Light\n\nINT. ROOM - NIGHT\nA painting hangs."),
  });
  await page.getByLabel("Choose cut").setInputFiles({
    name: "first-light.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("fixture-video"),
  });
  await page.getByRole("button", { name: "Start clearance analysis" }).click();

  await expect(page.getByText("Clearance analysis")).toBeVisible();
  await expect(page.getByRole("button", { name: /Review 3 cases/i })).toBeVisible();
  await page.getByRole("button", { name: /Review 3 cases/i }).click();
  await expect(page.getByText("Clearance review")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Clearance cases" })).toBeVisible();
});


test("an unscripted case accepts a scoped document but remains evidence-incomplete", async ({ page }) => {
  await installFixtureApi(page);
  await page.goto("/projects/proj_fixture?item=item_art");

  await expect(page.getByRole("button", { name: /Harbor Lights, 1961/i }).first()).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Documents · 0" }).click();
  await page.getByLabel("Document file").setInputFiles({
    name: "festival-licence.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("permission"),
  });
  await page.getByLabel("Title").fill("Festival licence");
  await page.getByLabel("Recorded media").fill("festival");
  await page.getByLabel("Recorded territories").fill("US");
  await page.getByLabel("Perpetual term is stated").check();
  await page.getByRole("button", { name: "Attach document" }).click();

  await expect(page.getByText("Recorded scope has gaps")).toBeVisible();
  await expect(page.getByText("Streaming is not listed in recorded media.")).toBeVisible();
  await page.getByRole("button", { name: /Close Documents/i }).click();
  await expect(page.getByText("Evidence ready").last()).toBeVisible();
});


test("revision compare applies only stored changed outcomes and keeps unchanged status", async ({ page }) => {
  const state = await installFixtureApi(page);
  await page.goto("/projects/proj_fixture/revisions/new");
  await page.getByLabel("Choose cut").setInputFiles({
    name: "night-drive-v2.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("fixture-video-v2"),
  });
  await page.getByRole("button", { name: "Build comparison" }).click();

  await expect(page.getByRole("region", { name: "Version Ripple" })).toBeVisible();
  await expect(page.getByText("Changed · Harbor Lights, 1961")).toBeVisible();
  await expect(page.getByText("Reopened · Midnight Orchard")).toBeVisible();
  await page.getByRole("button", { name: "Apply revision" }).click();
  await page.getByRole("button", { name: "Apply reviewed revision" }).click();
  await expect(page.getByText("Applied", { exact: true })).toBeVisible();

  expect(state.project.items.find((value) => value.stable_item_id === "stable_item_brand")?.workflow_status).toBe("coordinator_verified");
  expect(state.project.items.filter((value) => value.workflow_status === "reopened_by_revision")).toHaveLength(2);
});


test("packet preview requires confirmation and confirmed export is audited", async ({ page }) => {
  const state = fixtureState();
  state.project.items[0] = {
    ...state.project.items[0],
    workflow_status: "detected",
    color: "red",
    sources: [],
    citation_count: 0,
  };
  await installFixtureApi(page, state);
  await page.goto("/projects/proj_fixture/packet");

  await expect(page.getByText("Incomplete research")).toBeVisible();
  await page.getByRole("button", { name: "Export current packet" }).click();
  await expect(page.getByRole("dialog", { name: "Export current packet?" })).toContainText("records an audit event");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Markdown packet" }).click();
  await download;

  expect(state.exports).toBe(1);
  expect(state.project.audit_events.at(-1)?.action).toBe("packet_exported");
});


test("deep-link selection and workspace preferences survive reload", async ({ page }) => {
  await installFixtureApi(page);
  await page.goto("/projects/proj_fixture?item=item_brand");
  const selected = page.getByRole("button", { name: /Northstar Cola/i }).first();
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Verified", exact: true }).click();
  await page.reload();

  await expect(page.getByRole("button", { name: /Northstar Cola/i }).first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Verified", exact: true })).toHaveClass(/is-active/);
});


test("keyboard command palette works globally and does not steal text-input shortcuts", async ({ page }) => {
  await installFixtureApi(page);
  await page.goto("/projects/proj_fixture");

  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await page.getByLabel("Search commands").fill("packet");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/packet$/);

  await page.goto("/projects/proj_fixture");
  await page.getByLabel("Search clearance cases").focus();
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveCount(0);
});


test("reduced motion renders settled analysis and revision states", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const state = await installFixtureApi(page);
  await page.goto(`/projects/${state.project.id}/revisions/${state.candidateRevision.id}`);

  await expect(page.getByRole("region", { name: "Version Ripple" })).toHaveAttribute("data-settled", "true");
  await expect(page.getByText("New · Harbor Festival poster")).toBeVisible();
});
