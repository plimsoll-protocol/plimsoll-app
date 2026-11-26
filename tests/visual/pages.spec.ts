import { test, expect } from "@playwright/test";

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("Asset list", () => {
  test("desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("asset-list-desktop.png", {
      maxDiffPixelRatio: 0.01,
    });
  });

  test("mobile", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("asset-list-mobile.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});

test.describe("Reporters directory", () => {
  test("desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/reporters");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("reporters-desktop.png", {
      maxDiffPixelRatio: 0.01,
    });
  });

  test("mobile", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/reporters");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("reporters-mobile.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});
