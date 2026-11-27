import { expect, test } from "@playwright/test";
import { FILTER_PANEL_STORAGE_KEY } from "../lib/filter-panel";
import { mockIndexer } from "./fixtures";

test.describe("reporter filter panel", () => {
  test.beforeEach(async ({ page }) => {
    await mockIndexer(page);
    await page.goto("/reporters/");
    await expect(page.getByRole("cell", { name: "Alice Audit" })).toBeVisible();
  });

  test("is open by default on desktop and can be collapsed", async ({ page }) => {
    const toggle = page.getByRole("button", { name: /Filters/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("Search reporters")).toBeVisible();
    await expect(page.getByLabel("Sort by")).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByLabel("Search reporters")).toBeHidden();
  });

  test("filters by name or address and can be cleared", async ({ page }) => {
    const search = page.getByLabel("Search reporters");
    await search.fill("zoe");
    await expect(page.getByText("Zoe Transcribe")).toBeVisible();
    await expect(page.getByText("Alice Audit")).toHaveCount(0);
    await expect(page.getByText("1 of 5 shown")).toBeVisible();

    await search.fill("GBBD47");
    await expect(page.getByText("Zoe Transcribe")).toBeVisible();
    await expect(page.getByText("Carol Audit")).toHaveCount(0);

    await search.fill("");
    await expect(page.getByText("Alice Audit")).toBeVisible();
    await expect(page.getByText("5 of 5 shown")).toBeVisible();
  });

  test("sorts within each role", async ({ page }) => {
    await page.getByLabel("Sort by").selectOption("name-desc");
    const auditors = page.getByRole("region", { name: "Auditors" });
    await expect(auditors.locator("tbody tr").first()).toContainText("Carol Audit");
    await expect(auditors.locator("tbody tr").last()).toContainText("Alice Audit");
  });

  test("shows a filter count badge when collapsed and remembers the state", async ({ page }) => {
    await page.getByLabel("Search reporters").fill("Alice");
    const toggle = page.getByRole("button", { name: /Filters/ });
    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toContainText("1");
    await expect(toggle.getByLabel("1 active filter")).toBeVisible();

    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      FILTER_PANEL_STORAGE_KEY,
    );
    expect(stored).toBe("false");

    await page.reload();
    await expect(page.getByRole("cell", { name: "Alice Audit" })).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    // The search itself is not persisted, so the badge has nothing to count.
    await expect(toggle.locator(".filter-count")).toHaveCount(0);
  });

  test("is fully keyboard operable", async ({ page }) => {
    const toggle = page.getByRole("button", { name: /Filters/ });
    await toggle.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Search reporters")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("Search reporters")).toBeVisible();
  });
});

test.describe("reporter filter panel on a narrow screen", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("starts collapsed and opens from the keyboard", async ({ page }) => {
    await mockIndexer(page);
    await page.goto("/reporters/");
    await expect(page.getByRole("cell", { name: "Alice Audit" })).toBeVisible();

    const toggle = page.getByRole("button", { name: /Filters/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByLabel("Search reporters")).toBeHidden();

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("Search reporters")).toBeVisible();
  });
});
