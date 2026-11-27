import { expect, test } from "@playwright/test";
import { mockIndexer } from "./fixtures";

const PANEL = "#reporter-filter-panel";

test.describe("reporter filter panel", () => {
  test.beforeEach(async ({ page }) => {
    await mockIndexer(page);
  });

  test("is open by default on desktop, closes, and remembers it after a reload", async ({
    page,
  }) => {
    await page.goto("/reporters/");
    const panel = page.locator(PANEL);
    const toggle = page.getByRole("button", { name: /^(Show|Hide) filters$/ });
    await expect(panel).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await toggle.click();
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await page.reload();
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("defaults closed on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/reporters/");
    await expect(page.locator(PANEL)).toBeHidden();
    await expect(page.getByRole("button", { name: /^(Show|Hide) filters$/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("filters rows and shows the active count on the collapsed header", async ({ page }) => {
    await page.goto("/reporters/");
    const panel = page.locator(PANEL);
    const toggle = page.getByRole("button", { name: /^(Show|Hide) filters$/ });

    await page.getByLabel("Search reporters").fill("bob");
    await expect(page.getByText("Bob Transcriber")).toBeVisible();
    await expect(page.getByText("Alice Audit")).toHaveCount(0);
    await expect(page.getByText("Showing 1 of 3 reporters.")).toBeVisible();

    await toggle.click();
    await expect(panel).toBeHidden();
    await expect(page.getByText("1 active filter")).toBeVisible();

    await toggle.click();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByText("Alice Audit")).toBeVisible();
    await expect(page.getByText("Showing 3 of 3 reporters.")).toBeVisible();
  });

  test("works from the keyboard, including Escape to close", async ({ page }) => {
    await page.goto("/reporters/");
    const panel = page.locator(PANEL);
    const toggle = page.getByRole("button", { name: /^(Show|Hide) filters$/ });

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeHidden();

    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();

    await page.getByLabel("Search reporters").focus();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(toggle).toBeFocused();
  });
});
