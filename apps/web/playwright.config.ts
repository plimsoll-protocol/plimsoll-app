import { defineConfig, devices } from "@playwright/test";

const PORT = 4321;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    colorScheme: "light",
    reducedMotion: "reduce",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Runs the app itself; the indexer is enabled and its endpoints are mocked,
  // so the pages render fixed data without touching the network.
  webServer: {
    command:
      "cd ../.. && npm run build -w @plimsoll/sdk && " +
      `npm run dev -w @plimsoll/web -- -p ${PORT} --hostname 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_INDEXER_URL: BASE_URL,
      NEXT_PUBLIC_BASE_PATH: "",
    },
  },
});
