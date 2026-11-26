import { expect, test } from "@playwright/test";

/**
 * Visual regression tests for the three main Plimsoll pages.
 *
 * To update baselines after intentional UI changes:
 *   npx playwright test --update-snapshots
 *
 * Snapshots are stored in __snapshots__/ and committed to the repo.
 * The CI workflow fails when the pixel diff exceeds the configured threshold.
 */

test.describe("asset list page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".grid, .notice-bad", { timeout: 20_000 });
  });

  test("matches snapshot at desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page).toHaveScreenshot("asset-list-desktop.png", {
      fullPage: true,
    });
  });

  test("matches snapshot at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveScreenshot("asset-list-mobile.png", {
      fullPage: true,
    });
  });
});

test.describe("asset detail page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/asset/?sac=CBXLC2BWHIMJKSGAWVWKJB5BGHCCM2LWXBNIDQ7K2RPMWTF34S7PYNF");
    await page.waitForSelector("h1, .notice-bad", { timeout: 20_000 });
  });

  test("matches snapshot at desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page).toHaveScreenshot("asset-detail-desktop.png", {
      fullPage: true,
    });
  });

  test("matches snapshot at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveScreenshot("asset-detail-mobile.png", {
      fullPage: true,
    });
  });
});

test.describe("reporter directory page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reporters/");
    await page.waitForSelector("h1, .notice-bad, .notice-info", { timeout: 20_000 });
  });

  test("matches snapshot at desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page).toHaveScreenshot("reporters-desktop.png", {
      fullPage: true,
    });
  });

  test("matches snapshot at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveScreenshot("reporters-mobile.png", {
      fullPage: true,
    });
  });
});
