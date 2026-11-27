import { expect, test } from "@playwright/test";
import { PUSD_ISSUER, expectNoCriticalA11yViolations, mockIndexer } from "./fixtures";

test.describe("accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await mockIndexer(page);
  });

  test("asset list has no critical violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /PUSD/ })).toBeVisible();

    await expectNoCriticalA11yViolations(page, "asset list");
  });

  test("asset detail has no critical violations", async ({ page }) => {
    await page.goto(`/asset/?asset=PUSD:${PUSD_ISSUER}`);
    await expect(page.getByRole("heading", { level: 1, name: "PUSD" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reserve reports" })).toBeVisible();

    await expectNoCriticalA11yViolations(page, "asset detail");
  });

  test("reporter directory has no critical violations", async ({ page }) => {
    await page.goto("/reporters/");
    await expect(page.getByRole("heading", { level: 1, name: "Reporters" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Alice Audit" })).toBeVisible();

    await expectNoCriticalA11yViolations(page, "reporter directory");
  });
});
