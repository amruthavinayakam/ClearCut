import { defineConfig, devices } from "@playwright/test";


export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  outputDir: "/tmp/clearcut-playwright-results",
  fullyParallel: true,
  retries: 0,
  reporter: "line",
  expect: { timeout: 8_000 },
  use: {
    baseURL: "https://clearcut-frontend.lcl",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "https://clearcut-frontend.lcl",
    reuseExistingServer: true,
    timeout: 30_000,
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
  ],
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
});
