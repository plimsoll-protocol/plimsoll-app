import { describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  Tier,
  type IndexerAsset,
  type IndexerReport,
  type IndexerReporterReport,
  type ReporterReportsPage,
} from "@plimsoll/sdk";
import {
  ASSETS_PAGE_SIZE,
  MAX_REPORT_PAGES,
  collectReporterReports,
  latestReportsBy,
  paginate,
  reporterFromSearch,
  reporterHref,
  summariseReporterAssets,
} from "../lib/reporter-profile";

const G = Keypair.random().publicKey();

const report = (over: Partial<IndexerReporterReport> = {}): IndexerReporterReport => ({
  sac: "CA",
  tier: "transcribed",
  amount: "100",
  as_of: "2026-01-01T00:00:00Z",
  posted_at: "2026-01-02T00:00:00Z",
  reporter: G,
  doc_hash: "00",
  doc_uri: "https://example.com/r.pdf",
  tx_hash: "ab",
  ...over,
});

const asset = (sac: string, code: string, bps: number | null | "none" = 10_000): IndexerAsset => ({
  sac,
  code,
  issuer: "GI",
  listed_ledger: 1,
  listed_at: "2026-01-01T00:00:00Z",
  toml: null,
  supply: null,
  reports: {},
  coverage:
    bps === "none"
      ? null
      : {
          bps,
          ratio: null,
          tier: "transcribed",
          supply: "1",
          reserves: "1",
          supply_ledger: 1,
          supply_posted_at: "2026-01-01T00:00:00Z",
          report_as_of: "2026-01-01T00:00:00Z",
          report_age_seconds: 0,
          supply_age_seconds: 0,
          reporter: G,
          doc_uri: "",
        },
});

describe("reporterFromSearch", () => {
  it("accepts a valid account address", () => {
    expect(reporterFromSearch(`address=${G}`)).toEqual({ ok: true, address: G });
  });

  it("reports a missing address as missing", () => {
    expect(reporterFromSearch("")).toMatchObject({ ok: false, missing: true });
  });

  it("rejects a contract id or junk", () => {
    expect(reporterFromSearch("address=CABC")).toMatchObject({ ok: false, missing: false });
    expect(reporterFromSearch("address=<script>")).toMatchObject({ ok: false, missing: false });
  });

  it("round-trips through reporterHref", () => {
    const href = reporterHref(G);
    expect(href).toBe(`/reporter/?address=${G}`);
    expect(reporterFromSearch(href.split("?")[1] ?? "")).toEqual({ ok: true, address: G });
  });
});

describe("summariseReporterAssets", () => {
  it("folds reports into one row per asset with the asset's coverage", () => {
    const rows = summariseReporterAssets(
      [
        report({ sac: "CA", tier: "auditor_signed", posted_at: "2026-03-01T00:00:00Z" }),
        report({ sac: "CA", tier: "transcribed", posted_at: "2026-01-01T00:00:00Z" }),
        report({ sac: "CB", posted_at: "2026-02-01T00:00:00Z" }),
      ],
      [asset("CA", "PUSD", 10_250), asset("CB", "QUSD", 9_600)],
    );
    expect(rows).toEqual([
      {
        sac: "CA",
        code: "PUSD",
        reportCount: 2,
        latestPostedAt: Date.parse("2026-03-01T00:00:00Z") / 1000,
        latestTier: Tier.AuditorSigned,
        bps: 10_250,
      },
      {
        sac: "CB",
        code: "QUSD",
        reportCount: 1,
        latestPostedAt: Date.parse("2026-02-01T00:00:00Z") / 1000,
        latestTier: Tier.Transcribed,
        bps: 9_600,
      },
    ]);
  });

  it("keeps the newest tier whatever order reports arrive in", () => {
    const [row] = summariseReporterAssets(
      [
        report({ tier: "transcribed", posted_at: "2026-01-01T00:00:00Z" }),
        report({ tier: "issuer_signed", posted_at: "2026-05-01T00:00:00Z" }),
      ],
      [],
    );
    expect(row?.latestTier).toBe(Tier.IssuerSigned);
  });

  it("distinguishes no coverage, nothing owed and an unlisted asset", () => {
    const rows = summariseReporterAssets(
      [
        report({ sac: "CA", posted_at: "2026-03-01T00:00:00Z" }),
        report({ sac: "CB", posted_at: "2026-02-01T00:00:00Z" }),
        report({ sac: "CC", posted_at: "2026-01-01T00:00:00Z" }),
      ],
      [asset("CA", "A", "none"), asset("CB", "B", null)],
    );
    expect(rows.map((r) => [r.sac, r.code, r.bps])).toEqual([
      ["CA", "A", undefined],
      ["CB", "B", null],
      ["CC", null, undefined],
    ]);
  });

  it("skips unknown tiers and orders ties by code then contract", () => {
    const at = "2026-01-01T00:00:00Z";
    const rows = summariseReporterAssets(
      [
        report({ sac: "CZ", tier: "oracle" as IndexerReport["tier"] }),
        report({ sac: "CB", posted_at: at }),
        report({ sac: "CA", posted_at: at }),
        report({ sac: "CC", posted_at: at }),
      ],
      [asset("CA", "ZED"), asset("CB", "ABC"), asset("CC", "ABC")],
    );
    expect(rows.map((r) => r.sac)).toEqual(["CB", "CC", "CA"]);
  });
});

describe("latestReportsBy", () => {
  it("returns only this reporter's current reports, tagged with their asset", () => {
    const mine = report({ tier: "auditor_signed" });
    const a = asset("CA", "A");
    a.reports = { auditor_signed: mine, transcribed: report({ reporter: "GOTHER" }) };
    const b = asset("CB", "B");
    expect(latestReportsBy(G, [a, b])).toEqual([{ ...mine, sac: "CA" }]);
  });
});

describe("collectReporterReports", () => {
  const page = (n: number, nextBefore: number | null): ReporterReportsPage => ({
    reports: Array.from({ length: n }, () => report()),
    nextBefore,
  });

  it("follows nextBefore until the last page", async () => {
    const fetchPage = vi
      .fn<(before: number | undefined) => Promise<ReporterReportsPage>>()
      .mockResolvedValueOnce(page(2, 90))
      .mockResolvedValueOnce(page(2, 40))
      .mockResolvedValueOnce(page(1, null));
    const result = await collectReporterReports(fetchPage);
    expect(result.complete).toBe(true);
    expect(result.reports).toHaveLength(5);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([undefined, 90, 40]);
  });

  it("stops when a page is empty", async () => {
    const fetchPage = vi.fn(async () => page(0, 10));
    await expect(collectReporterReports(fetchPage)).resolves.toEqual({
      reports: [],
      complete: true,
    });
  });

  it("stops, incomplete, when the cursor does not move older", async () => {
    const fetchPage = vi.fn(async () => page(1, 50));
    const result = await collectReporterReports(fetchPage);
    expect(result.complete).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("stops, incomplete, at the page cap", async () => {
    let next = 1_000_000;
    const fetchPage = vi.fn(async () => page(1, --next));
    const result = await collectReporterReports(fetchPage);
    expect(result.complete).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(MAX_REPORT_PAGES);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 60 }, (_, i) => i);

  it("uses 25 rows per page by default", () => {
    expect(ASSETS_PAGE_SIZE).toBe(25);
    const p = paginate(items, 1);
    expect(p).toMatchObject({ page: 1, pageCount: 3, first: 1, last: 25, total: 60 });
    expect(p.items).toEqual(items.slice(0, 25));
  });

  it("returns a short final page", () => {
    const p = paginate(items, 3);
    expect(p).toMatchObject({ page: 3, first: 51, last: 60 });
    expect(p.items).toHaveLength(10);
  });

  it("clamps out-of-range and non-integer pages", () => {
    expect(paginate(items, 0).page).toBe(1);
    expect(paginate(items, 99).page).toBe(3);
    expect(paginate(items, Number.NaN).page).toBe(1);
  });

  it("does not paginate 25 or fewer", () => {
    expect(paginate(items.slice(0, 25), 1).pageCount).toBe(1);
  });

  it("handles an empty list", () => {
    expect(paginate([], 1)).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      first: 0,
      last: 0,
      total: 0,
    });
  });
});
