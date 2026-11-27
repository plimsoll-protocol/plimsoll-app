import { expect, test } from "@playwright/test";
import { PUSD_ISSUER, expectNoCriticalA11yViolations, mockIndexer } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ASSET_SAC, mockIndexer } from "./fixtures";

type Violation = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"][number];

/** Every violation, with its impact and the selector of each offending node. */
function describeViolations(label: string, violations: readonly Violation[]): string {
  if (violations.length === 0) return `${label}: no violations`;
  const lines = [`${label}: ${violations.length} violation(s)`];
  for (const v of violations) {
    lines.push(`- ${v.id} [impact: ${v.impact ?? "unknown"}] ${v.help}`);
    for (const node of v.nodes) lines.push(`    element: ${node.target.join(" ")}`);
  }
  return lines.join("\n");
}

/**
 * Runs axe on the current page. Every violation is logged with its impact and
 * element selector; only critical violations fail the test, which is the
 * threshold the repository agreed to hold CI to.
 */
async function expectNoCriticalViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  for (const v of results.violations) {
    console.log(`[a11y] ${v.id} impact=${v.impact ?? "unknown"} help=${v.help}`);
    for (const node of v.nodes) {
      console.log(`[a11y] element: ${node.target.join(" ")}`);
    }
  }
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical, describeViolations(label, critical)).toEqual([]);
}

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
  test("asset list has no critical axe violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /PUSD/ }).first()).toBeVisible();
    await expectNoCriticalViolations(page, "asset list");
  });

  test("asset detail has no critical axe violations", async ({ page }) => {
    await page.goto(`/asset/?sac=${ASSET_SAC}`);
    await expect(page.getByRole("heading", { level: 1, name: "PUSD" })).toBeVisible();
    await expectNoCriticalViolations(page, "asset detail");
  });

  test("reporter directory has no critical axe violations", async ({ page }) => {
    await page.goto("/reporters/");
    await expect(page.getByRole("heading", { level: 1, name: "Reporters" })).toBeVisible();
    // The panel opens by default on desktop, after the stored-state effect runs.
    await expect(page.locator("#reporter-filter-panel")).toBeVisible();
    await expect(page.getByText("Alice Audit")).toBeVisible();
    await expectNoCriticalViolations(page, "reporter directory");
  });
});
