import {
  IndexerClient,
  PlimsollContracts,
  Tier,
  tierFromName,
  type IndexerAsset,
  type IndexerSource,
  type IndexerToml,
} from "@plimsoll/sdk";
import { config } from "./config";

/**
 * How a figure reached us. Not the same as AssetView.source, which says which
 * service answered: a figure read from the indexer may still have been
 * recovered from contract state rather than observed in an event, and then no
 * transaction can be shown for it.
 */
export type Origin = IndexerSource;

/** One report, normalised from either source. Times are unix seconds. */
export interface ReportView {
  tier: Tier;
  amount: bigint;
  asOf: number;
  postedAt: number;
  reporter: string;
  docHash: string;
  docUri: string;
  txHash?: string;
  origin: Origin;
}

export interface SupplyView {
  amount: bigint;
  ledger: number;
  postedAt: number;
  breakdownHash: string;
  poster: string;
  txHash?: string;
  origin: Origin;
}

export interface CoverageView {
  bps: number;
  tier: Tier;
  supply: bigint;
  reserves: bigint;
  supplyPostedAt: number;
  reportAsOf: number;
}

export interface AssetView {
  sac: string;
  code: string;
  issuer: string;
  supply: SupplyView | null;
  reports: Partial<Record<Tier, ReportView>>;
  coverage: CoverageView | null;
  toml: IndexerToml | null;
  source: "indexer" | "chain";
}

export const contracts = new PlimsollContracts(config.network);
// A sleeping free-tier indexer can take a minute to wake; fall back to the
// chain rather than leave the page loading.
const INDEXER_TIMEOUT_MS = 8_000;
const fetchWithTimeout: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(INDEXER_TIMEOUT_MS) });

export const indexer = config.indexerUrl
  ? new IndexerClient(config.indexerUrl, fetchWithTimeout)
  : null;

const secs = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function fromIndexer(a: IndexerAsset): AssetView {
  const reports: AssetView["reports"] = {};
  for (const r of Object.values(a.reports)) {
    if (!r) continue;
    const tier = tierFromName(r.tier);
    if (tier === undefined) continue;
    reports[tier] = {
      tier,
      amount: BigInt(r.amount),
      asOf: secs(r.as_of),
      postedAt: secs(r.posted_at),
      reporter: r.reporter,
      docHash: r.doc_hash,
      docUri: r.doc_uri,
      txHash: r.tx_hash,
      origin: r.source ?? "event",
    };
  }
  const c = a.coverage;
  return {
    sac: a.sac,
    code: a.code,
    issuer: a.issuer,
    supply: a.supply && {
      amount: BigInt(a.supply.amount),
      ledger: a.supply.ledger,
      postedAt: secs(a.supply.posted_at),
      breakdownHash: a.supply.breakdown_hash,
      poster: a.supply.poster,
      txHash: a.supply.tx_hash,
      origin: a.supply.source ?? "event",
    },
    reports,
    coverage: c && {
      bps: c.bps ?? 4_294_967_295,
      tier: tierFromName(c.tier) ?? Tier.Transcribed,
      supply: BigInt(c.supply),
      reserves: BigInt(c.reserves),
      supplyPostedAt: secs(c.supply_posted_at),
      reportAsOf: secs(c.report_as_of),
    },
    toml: a.toml,
    source: "indexer",
  };
}

/** Read one asset straight from the contracts. */
export async function loadFromChain(sac: string): Promise<AssetView | null> {
  const asset = await contracts.getAsset(sac);
  if (!asset) return null;
  const tiers = [Tier.Transcribed, Tier.IssuerSigned, Tier.AuditorSigned];
  const [supply, coverage, ...reportList] = await Promise.all([
    contracts.getSupply(sac),
    contracts.coverage(sac, Tier.Transcribed),
    ...tiers.map((t) => contracts.getReport(sac, t)),
  ]);
  const reports: AssetView["reports"] = {};
  // Read from contract state, so there is no event or transaction behind these.
  for (const r of reportList) if (r) reports[r.tier] = { ...r, origin: "chain" };
  return {
    sac,
    code: asset.code,
    issuer: asset.issuer,
    supply: supply && {
      amount: supply.amount,
      ledger: supply.ledger,
      postedAt: supply.timestamp,
      breakdownHash: supply.breakdownHash,
      poster: supply.poster,
      origin: "chain",
    },
    reports,
    coverage: coverage && {
      bps: coverage.bps,
      tier: coverage.tier,
      supply: coverage.supply,
      reserves: coverage.reserves,
      supplyPostedAt: coverage.supplyTimestamp,
      reportAsOf: coverage.reportAsOf,
    },
    toml: null,
    source: "chain",
  };
}

/** All assets: from the indexer when configured, otherwise from the chain. */
export async function loadAssets(): Promise<AssetView[]> {
  if (indexer) {
    try {
      const listed = await indexer.listAssets();
      // An empty list from a freshly rebuilt indexer is not proof that nothing
      // is listed on-chain; fall through to the contracts.
      if (listed.length > 0) return listed.map(fromIndexer);
    } catch (err) {
      console.warn("Indexer unavailable, reading from chain", err);
    }
  }
  const all = await Promise.all(config.chainAssets.map((sac) => loadFromChain(sac).catch(() => null)));
  return all.filter((a): a is AssetView => a !== null);
}

export async function loadAsset(sac: string): Promise<AssetView | null> {
  if (indexer) {
    try {
      return fromIndexer(await indexer.getAsset(sac));
    } catch (err) {
      console.warn("Indexer unavailable, reading from chain", err);
    }
  }
  return loadFromChain(sac);
}

/**
 * Registry names for reporter addresses, so a report can say who signed it
 * rather than only showing a truncated address.
 *
 * Cached for the life of the page: the registry changes when an admin
 * registers or revokes a reporter, which is rare, and a dashboard would
 * otherwise re-ask for the same handful of addresses on every navigation. A
 * name that is absent is cached too, so an unregistered address is asked about
 * once.
 */
const nameCache = new Map<string, string | null>();

export async function loadReporterNames(addresses: readonly string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(addresses)].filter((a) => a.length > 0);
  const missing = wanted.filter((a) => !nameCache.has(a));

  if (missing.length > 0) {
    if (indexer) {
      try {
        // One request covers every reporter, so ask once however many are missing.
        const all = await indexer.reporters();
        for (const r of all) nameCache.set(r.address, r.name);
        for (const a of missing) if (!nameCache.has(a)) nameCache.set(a, null);
      } catch (err) {
        console.warn("Indexer unavailable, reading reporter names from chain", err);
      }
    }
    const stillMissing = missing.filter((a) => !nameCache.has(a));
    await Promise.all(
      stillMissing.map(async (a) => {
        try {
          const info = await contracts.getReporter(a);
          nameCache.set(a, info?.name ?? null);
        } catch (err) {
          // Leave it uncached: a failed read is not evidence of no name.
          console.warn(`Could not read the registry name for ${a}`, err);
        }
      }),
    );
  }

  const out = new Map<string, string>();
  for (const a of wanted) {
    const name = nameCache.get(a);
    if (name) out.set(a, name);
  }
  return out;
}
