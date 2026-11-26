import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** The v0.1 testnet PUSD asset, used as the fixture for every page. */
export const PUSD_ISSUER = "GBIE3ANCRVCBWETUZXWYKRMP27LQVJHX757XXAQUT3LYHVTNFPPPXEY4";
export const PUSD_SAC = "CCHPT4TEJDPZQDSUVW3NP6A35ROGV4WEFZKT45SKWYCFZSUB7R5HIM7S";

const PUSD = {
  sac: PUSD_SAC,
  code: "PUSD",
  issuer: PUSD_ISSUER,
  listed_ledger: 1234,
  listed_at: "2026-11-01T00:00:00Z",
  toml: {
    home_domain: "example.com",
    org_name: "Plimsoll Demo Issuer",
    currency: {
      code: "PUSD",
      issuer: PUSD_ISSUER,
      name: "Plimsoll USD",
      is_asset_anchored: true,
      anchor_asset: "USD",
      attestation_of_reserve: "https://example.com/attestation.pdf",
    },
  },
  supply: {
    amount: "10000000000000",
    ledger: 2233445,
    posted_at: "2026-11-20T12:00:00Z",
    breakdown_hash: "ab".repeat(32),
    poster: PUSD_ISSUER,
    tx_hash: "cd".repeat(32),
    source: "event",
  },
  reports: {
    auditor_signed: {
      tier: "auditor_signed",
      amount: "10500000000000",
      as_of: "2026-11-19T00:00:00Z",
      posted_at: "2026-11-20T00:00:00Z",
      reporter: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      doc_hash: "ef".repeat(32),
      doc_uri: "https://example.com/reserve-report.pdf",
      tx_hash: "12".repeat(32),
      source: "event",
    },
    transcribed: {
      tier: "transcribed",
      amount: "10200000000000",
      as_of: "2026-11-18T00:00:00Z",
      posted_at: "2026-11-19T00:00:00Z",
      reporter: PUSD_ISSUER,
      doc_hash: "34".repeat(32),
      doc_uri: "https://example.com/transcript.pdf",
      tx_hash: "56".repeat(32),
      source: "event",
    },
  },
  coverage: {
    bps: 10500,
    ratio: "1.05",
    tier: "auditor_signed",
    supply: "10000000000000",
    reserves: "10500000000000",
    supply_ledger: 2233445,
    supply_posted_at: "2026-11-20T12:00:00Z",
    report_as_of: "2026-11-19T00:00:00Z",
    report_age_seconds: 86_400,
    supply_age_seconds: 43_200,
    reporter: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    doc_uri: "https://example.com/reserve-report.pdf",
  },
};

export const REPORTERS = [
  {
    address: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    role: "auditor",
    name: "Alice Audit",
    updated_at: "2026-11-01T00:00:00Z",
  },
  {
    address: "GCCMGQ3UGITN2HUUSQKTDMBFZ34QQTKMODR56NT26JMPH2MHVYWZMXNE",
    role: "auditor",
    name: "Carol Audit",
    updated_at: "2026-11-22T00:00:00Z",
  },
  {
    address: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    role: "transcriber",
    name: "Zoe Transcribe",
    updated_at: "2026-11-10T00:00:00Z",
  },
  {
    address: PUSD_ISSUER,
    role: "transcriber",
    name: "Bob Ledger",
    updated_at: "2026-11-15T00:00:00Z",
  },
  {
    address: "GDQNY3PBOJOKYZSRMK2S7LHHGWZIUISD4QORETLMXEWXBI7KFZZMKTL3",
    role: "supply_poster",
    name: "Dana Poster",
    updated_at: "2026-11-18T00:00:00Z",
  },
];

/**
 * Answers the indexer endpoints the pages use, so a11y and filter tests run
 * against fixed data rather than the testnet indexer.
 */
export async function mockIndexer(page: Page): Promise<void> {
  await page.route(/\/v1\/assets\?min_tier=\d+$/, (route) =>
    route.fulfill({ json: { assets: [PUSD] } }),
  );
  await page.route(/\/v1\/assets\/[^/?]+(\?.*)?$/, (route) => route.fulfill({ json: PUSD }));
  await page.route(/\/v1\/reporters(\?.*)?$/, (route) =>
    route.fulfill({ json: { reporters: REPORTERS } }),
  );
}

/**
 * Runs axe over WCAG A/AA rules and fails on any critical violation. Every
 * violation found is logged with its impact and the elements it applies to, so
 * a CI failure names the rule and the selector to fix.
 */
export async function expectNoCriticalA11yViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  for (const violation of results.violations) {
    const selectors = violation.nodes.flatMap((node) => node.target).join(", ");
    console.log(
      `[a11y:${label}] ${violation.id} (impact: ${violation.impact ?? "unknown"}) — ` +
        `${violation.help} — ${selectors}`,
    );
  }

  const critical = results.violations
    .filter((violation) => violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      selectors: violation.nodes.flatMap((node) => node.target),
    }));

  expect(critical, `critical accessibility violations on the ${label} page`).toEqual([]);
}
