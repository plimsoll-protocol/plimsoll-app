import {
  Tier,
  tierFromName,
  type IndexerAsset,
  type IndexerReporterReport,
  type ReporterReportsPage,
} from "@plimsoll/sdk";
import { StrKey } from "@stellar/stellar-sdk";

/** Rows per page on the reporter profile's asset list. */
export const ASSETS_PAGE_SIZE = 25;

/** Reports asked for per indexer request when walking a reporter's history. */
export const REPORTS_PAGE_LIMIT = 200;

/** Upper bound on history pages fetched, so a misbehaving cursor cannot loop forever. */
export const MAX_REPORT_PAGES = 50;

export type ReporterQuery =
  { ok: true; address: string } | { ok: false; error: string; missing: boolean };

/** Link to a reporter's profile page. */
export function reporterHref(address: string): string {
  return `/reporter/?address=${encodeURIComponent(address)}`;
}

/** Reads /reporter/?address=G..., validated so a bad link never reaches the indexer. */
export function reporterFromSearch(search: string): ReporterQuery {
  const address = new URLSearchParams(search).get("address")?.trim() ?? "";
  if (!address) {
    return {
      ok: false,
      error: "No reporter selected. Choose one from the reporter registry.",
      missing: true,
    };
  }
  if (!StrKey.isValidEd25519PublicKey(address)) {
    return {
      ok: false,
      error: "The address parameter must be a valid Stellar account address (starts with G).",
      missing: false,
    };
  }
  return { ok: true, address };
}

/** One asset a reporter has reported on, as the profile page lists it. */
export interface ReporterAsset {
  sac: string;
  /** Asset code, or null when the indexer does not list the asset. */
  code: string | null;
  /** Reports from this reporter on this asset that were seen. */
  reportCount: number;
  /** When the reporter's newest report on this asset was posted, unix seconds. */
  latestPostedAt: number;
  /** Tier of that newest report. */
  latestTier: Tier;
  /**
   * The asset's latest coverage in basis points: a number, null when nothing
   * is owed (zero supply), or undefined when there is no coverage reading.
   */
  bps: number | null | undefined;
}

const secs = (iso: string): number => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
};

/**
 * Fold a reporter's reports into one row per asset, joined with the asset
 * list for codes and current coverage. Newest activity first, then by code
 * and contract id so the order is stable between loads. Reports with a tier
 * this build does not know are skipped.
 */
export function summariseReporterAssets(
  reports: readonly IndexerReporterReport[],
  assets: readonly IndexerAsset[],
): ReporterAsset[] {
  const bySac = new Map(assets.map((a) => [a.sac, a]));
  const rows = new Map<string, ReporterAsset>();
  for (const report of reports) {
    const tier = tierFromName(report.tier);
    if (tier === undefined || !report.sac) continue;
    const postedAt = secs(report.posted_at);
    const row = rows.get(report.sac);
    if (!row) {
      const asset = bySac.get(report.sac);
      rows.set(report.sac, {
        sac: report.sac,
        code: asset?.code ?? null,
        reportCount: 1,
        latestPostedAt: postedAt,
        latestTier: tier,
        bps: asset?.coverage ? asset.coverage.bps : undefined,
      });
      continue;
    }
    row.reportCount += 1;
    if (postedAt > row.latestPostedAt) {
      row.latestPostedAt = postedAt;
      row.latestTier = tier;
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.latestPostedAt - a.latestPostedAt ||
      (a.code ?? "").localeCompare(b.code ?? "") ||
      a.sac.localeCompare(b.sac),
  );
}

/**
 * The reporter's latest report per tier on each listed asset, for an indexer
 * that does not serve the reporter reports endpoint yet. Older reports that
 * have since been superseded are not visible this way.
 */
export function latestReportsBy(
  address: string,
  assets: readonly IndexerAsset[],
): IndexerReporterReport[] {
  const out: IndexerReporterReport[] = [];
  for (const asset of assets) {
    for (const report of Object.values(asset.reports)) {
      if (report && report.reporter === address) out.push({ ...report, sac: asset.sac });
    }
  }
  return out;
}

/**
 * Walk every page of a reporter's report history. Stops at the last page, at
 * MAX_REPORT_PAGES, or when the cursor fails to move older, so a misbehaving
 * indexer cannot hold the page in a loop.
 */
export async function collectReporterReports(
  fetchPage: (before: number | undefined) => Promise<ReporterReportsPage>,
): Promise<{ reports: IndexerReporterReport[]; complete: boolean }> {
  const reports: IndexerReporterReport[] = [];
  let before: number | undefined;
  for (let i = 0; i < MAX_REPORT_PAGES; i++) {
    const page = await fetchPage(before);
    reports.push(...page.reports);
    if (page.nextBefore === null || page.reports.length === 0) {
      return { reports, complete: true };
    }
    if (before !== undefined && page.nextBefore >= before) return { reports, complete: false };
    before = page.nextBefore;
  }
  return { reports, complete: false };
}

export interface Page<T> {
  items: T[];
  /** 1-based page number, clamped to the available pages. */
  page: number;
  pageCount: number;
  /** 1-based index of the first item shown, 0 when there are none. */
  first: number;
  /** 1-based index of the last item shown. */
  last: number;
  total: number;
}

/** Slice one page out of a list. Page numbers are 1-based and clamped. */
export function paginate<T>(
  items: readonly T[],
  page: number,
  size: number = ASSETS_PAGE_SIZE,
): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    page: current,
    pageCount,
    first: slice.length > 0 ? start + 1 : 0,
    last: start + slice.length,
    total,
  };
}
