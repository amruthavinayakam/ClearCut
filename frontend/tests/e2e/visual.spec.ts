import { expect, test } from "@playwright/test";

import { fixtureState, installFixtureApi } from "./fixtures";


test("core product surfaces remain visually stable", async ({ page }) => {
  const state = await installFixtureApi(page);
  await page.goto("/");
  await expect(page).toHaveScreenshot("library.png", { fullPage: true, animations: "disabled" });

  await page.goto("/projects/new");
  await expect(page).toHaveScreenshot("intake.png", { fullPage: true, animations: "disabled" });

  await page.goto(`/projects/${state.project.id}?item=item_art`);
  await expect(page).toHaveScreenshot("review.png", { fullPage: true, animations: "disabled" });

  await page.goto(`/projects/${state.project.id}/revisions/${state.candidateRevision.id}`);
  await expect(page).toHaveScreenshot("revision.png", { fullPage: true, animations: "disabled" });

  await page.goto(`/projects/${state.project.id}/packet`);
  await expect(page).toHaveScreenshot("packet.png", { fullPage: true, animations: "disabled" });
});

test("mobile library and review remain visually stable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixtureApi(page);
  await page.goto("/");
  await expect(page).toHaveScreenshot("mobile-library.png", { fullPage: true, animations: "disabled" });
  await page.goto("/projects/proj_fixture?item=item_art");
  await expect(page).toHaveScreenshot("mobile-review.png", { fullPage: true, animations: "disabled" });
});

test("boot, empty, processing, evidence, and tablet states remain visually stable", async ({ page }) => {
  const config = {
    mock_research: false, parallel_configured: true, vertex: true, project: "fixture-project",
    search_mode: "one-shot", processor: "core", gcs_bucket: null, webhooks_enabled: false,
    sample_available: false,
  };
  await page.route(/^https?:\/\/[^/]+\/api\/config$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(config) });
  });
  await page.route(/^https?:\/\/[^/]+\/api\/projects(?:\?.*)?$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ projects: [] }) });
  });
  await page.goto("/");
  await expect(page.getByText("Opening project workspace")).toBeAttached();
  await page.waitForTimeout(400);
  await expect(page).toHaveScreenshot("boot.png", { fullPage: true, animations: "disabled" });

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await installFixtureApi(page);
  await page.route(/^https?:\/\/[^/]+\/api\/projects(?:\?.*)?$/, (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ projects: [] }),
  }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Find what entered between the page and the screen." })).toBeVisible();
  await expect(page).toHaveScreenshot("empty-library.png", { fullPage: true, animations: "disabled" });

  await page.unrouteAll({ behavior: "ignoreErrors" });
  const processing = fixtureState();
  processing.project.phase = "researching";
  await installFixtureApi(page, processing);
  await page.route(/^https?:\/\/[^/]+\/api\/projects\/proj_fixture\/stream$/, (route) => route.fulfill({
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    body: `data: ${JSON.stringify({ type: "snapshot", project: processing.project })}\n\n`,
  }));
  await page.goto("/projects/proj_fixture");
  await expect(page.getByText("Clearance analysis")).toBeVisible();
  await expect(page).toHaveScreenshot("processing.png", { fullPage: true, animations: "disabled" });

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await installFixtureApi(page);
  await page.goto("/projects/proj_fixture?item=item_music");
  await page.getByRole("button", { name: "Documents · 1", exact: true }).click();
  await expect(page.getByText("Recorded scope has gaps")).toBeVisible();
  await expect(page).toHaveScreenshot("partial-scope.png", { fullPage: true, animations: "disabled" });

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.getByRole("button", { name: /Close Documents/i }).click();
  await expect(page).toHaveScreenshot("tablet-review.png", { animations: "disabled" });
  await page.goto("/projects/proj_fixture/revisions/revision_2");
  await expect(page).toHaveScreenshot("tablet-revision.png", { animations: "disabled" });
});
