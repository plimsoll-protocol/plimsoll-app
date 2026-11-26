import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression tests for the Plimsoll web app.
 *
 * Run tests:   npx playwright test
 * Update baselines: npx playwright test --update-snapshots
 *
 * Baselines are stored in tests/visual/__snapshots__ alongside the spec files
 * and committed to the repo. CI fails when pixel diff exceeds the threshold.
 */
export default defineConfig({
  testDir: "./tests/visual",
  snapshotDir: "./tests/visual/__snapshots__",
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  workers: process.env["CI"] ? 2 : undefined,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: process.env["BASE_URL"] ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env["BASE_URL"]
    ? undefined
    : {
        command: "npm run dev -w @plimsoll/web",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env["CI"],
        timeout: 120_000,
      },
});
