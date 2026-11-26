"use client";

import { IndexerClient, tierFromName, Tier, type IndexerReport, type IndexerAsset } from "@plimsoll/sdk";
import { indexer } from "./data";
import { config } from "./config";
import type { ReportView } from "./data";

const secs = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

/**
 * Reports made by a specific reporter, aggregated across all assets.
 * Loads all assets and filters their reports by the given reporter address.
 */
export async function loadReporterReports(
  reporter: string,
): Promise<{ sac: string; code: string; issuer: string; report: ReportView }[]> {
  if (!indexer) return [];
  const assets = await indexer.listAssets();
  const out: { sac: string; code: string; issuer: string; report: ReportView }[] = [];
  for (const a of assets) {
    const reports = await indexer.reportHistory(a.sac, 1000);
    for (const r of reports) {
      if (r.reporter.toLowerCase() === reporter.toLowerCase()) {
        const tier = tierFromName(r.tier);
        if (tier !== undefined) {
          out.push({
            sac: a.sac,
            code: a.code,
            issuer: a.issuer,
            report: {
              tier,
              amount: BigInt(r.amount),
              asOf: secs(r.as_of),
              postedAt: secs(r.posted_at),
              reporter: r.reporter,
              docHash: r.doc_hash,
              docUri: r.doc_uri,
              txHash: r.tx_hash,
              origin: r.source ?? "event",
            },
          });
        }
      }
    }
  }
  return out.sort((a, b) => b.report.postedAt - a.report.postedAt);
}