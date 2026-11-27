import {
  TransactionBuilder,
  type FeeBumpTransaction,
  type Transaction,
} from "@stellar/stellar-sdk";
import { Tier, tierFromName, type ReportPostedEvent } from "@plimsoll/sdk";
import type { AssetView, ReportView } from "./data";

/**
 * Reports the visitor has signed but the app has not yet seen confirmed.
 *
 * The report page records one as soon as the wallet hands back the signed
 * transaction, so the asset page can show it straight away, marked pending.
 * The entry goes when the indexer's SSE stream (or a later read of the asset)
 * shows the same report, or when the transaction fails. Entries live in
 * localStorage so an asset page open in another tab sees them too.
 */
export interface PendingReport {
  /** Hex hash of the signed transaction; identifies the entry. */
  txHash: string;
  sac: string;
  tier: Tier;
  /** Smallest units, as a decimal string (JSON has no bigint). */
  amount: string;
  /** Unix seconds. */
  asOf: number;
  reporter: string;
  docHash: string;
  docUri: string;
  /** Unix milliseconds when the report was signed. */
  createdAt: number;
}

/** A pending report shaped like a confirmed one, for the reports table. */
export interface PendingReportView extends ReportView {
  pending: true;
  txHash: string;
}

export const PENDING_KEY = "plimsoll:pending-reports";

/**
 * How long an unconfirmed entry is kept. A transaction that has neither landed
 * nor failed by then (the tab closed mid-submit, say) is not going to be
 * confirmed by this page, and a row that never resolves is worse than none.
 */
export const PENDING_TTL_MS = 60 * 60_000;

type Store = Pick<Storage, "getItem" | "setItem">;

const defaultStore = (): Store | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

function isPending(v: unknown): v is PendingReport {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.txHash === "string" &&
    typeof r.sac === "string" &&
    (r.tier === Tier.Transcribed ||
      r.tier === Tier.IssuerSigned ||
      r.tier === Tier.AuditorSigned) &&
    typeof r.amount === "string" &&
    /^\d+$/.test(r.amount) &&
    typeof r.asOf === "number" &&
    typeof r.reporter === "string" &&
    typeof r.docHash === "string" &&
    typeof r.docUri === "string" &&
    typeof r.createdAt === "number"
  );
}

/** Every unexpired entry. Never throws: storage may be missing, full or hand-edited. */
export function loadPending(
  store: Store | null = defaultStore(),
  now = Date.now(),
): PendingReport[] {
  if (!store) return [];
  try {
    const raw = store.getItem(PENDING_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.filter(isPending).filter((p) => now - p.createdAt < PENDING_TTL_MS);
  } catch {
    return [];
  }
}

function save(store: Store | null, list: PendingReport[]): void {
  if (!store) return;
  try {
    store.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    // Storage full or disabled: the report still posts, it just is not shown early.
  }
  notify();
}

/**
 * Record a signed report, stamped with `now` as its creation time. Replaces
 * an entry with the same transaction hash.
 */
export function addPending(
  report: Omit<PendingReport, "createdAt">,
  store: Store | null = defaultStore(),
  now = Date.now(),
): void {
  const hash = report.txHash.toLowerCase();
  save(store, [
    ...loadPending(store, now).filter((p) => p.txHash !== hash),
    { ...report, txHash: hash, createdAt: now },
  ]);
}

/** Drop entries by transaction hash: confirmed, or reverted after a failure. */
export function removePending(
  txHashes: readonly string[],
  store: Store | null = defaultStore(),
  now = Date.now(),
): void {
  if (txHashes.length === 0) return;
  const drop = new Set(txHashes.map((h) => h.toLowerCase()));
  save(
    store,
    loadPending(store, now).filter((p) => !drop.has(p.txHash)),
  );
}

/** One asset's pending entries, oldest first. */
export function pendingFor(list: readonly PendingReport[], sac: string): PendingReport[] {
  return list.filter((p) => p.sac === sac).sort((a, b) => a.createdAt - b.createdAt);
}

export function toView(p: PendingReport): PendingReportView {
  return {
    pending: true,
    tier: p.tier,
    amount: BigInt(p.amount),
    asOf: p.asOf,
    postedAt: Math.floor(p.createdAt / 1000),
    reporter: p.reporter,
    docHash: p.docHash,
    docUri: p.docUri,
    txHash: p.txHash,
    origin: "event",
  };
}

/** The hash a signed transaction will have on-chain, before it is sent, as lowercase hex. */
export function txHashOf(signedXdr: string, networkPassphrase: string): string {
  const tx: Transaction | FeeBumpTransaction = TransactionBuilder.fromXDR(
    signedXdr,
    networkPassphrase,
  );
  return Array.from(tx.hash(), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Does this confirmed report stand for the pending one? The transaction hash
 * settles it when both sides have one. A report the indexer recovered from
 * contract state, or read straight from the chain, has no hash, so then the
 * report's own fields have to agree.
 */
export function sameReport(p: PendingReport, r: ReportView): boolean {
  if (r.txHash) return r.txHash.toLowerCase() === p.txHash;
  return (
    r.tier === p.tier &&
    r.reporter === p.reporter &&
    r.asOf === p.asOf &&
    r.docHash.toLowerCase() === p.docHash.toLowerCase() &&
    r.amount === BigInt(p.amount)
  );
}

/** Hashes of the pending entries an asset's loaded reports already confirm. */
export function confirmedIn(pending: readonly PendingReport[], asset: AssetView): string[] {
  return pending
    .filter((p) => p.sac === asset.sac)
    .filter((p) => {
      const r = asset.reports[p.tier];
      return r !== undefined && sameReport(p, r);
    })
    .map((p) => p.txHash);
}

const secs = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

/** A `report_posted` SSE event as a confirmed report row, or null if it is malformed. */
export function reportFromEvent(ev: ReportPostedEvent): ReportView | null {
  const tier = tierFromName(ev.tier);
  if (tier === undefined || !/^\d+$/.test(ev.amount)) return null;
  const asOf = secs(ev.as_of);
  const postedAt = secs(ev.posted_at);
  if (Number.isNaN(asOf) || Number.isNaN(postedAt)) return null;
  return {
    tier,
    amount: BigInt(ev.amount),
    asOf,
    postedAt,
    reporter: ev.reporter,
    docHash: ev.doc_hash,
    docUri: ev.doc_uri,
    txHash: ev.tx_hash,
    origin: "event",
  };
}

/**
 * The asset with a confirmed report put in its tier's place, which is where
 * the pending row it replaces was shown. Only a report at least as recent as
 * the stored one replaces it, matching the contract's StaleReport rule.
 */
export function withReport(asset: AssetView, report: ReportView): AssetView {
  const current = asset.reports[report.tier];
  if (current && current.asOf > report.asOf) return asset;
  return { ...asset, reports: { ...asset.reports, [report.tier]: report } };
}

// ---- change notification ---------------------------------------------------

const EVENT = "plimsoll:pending-reports";

function notify(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Call `cb` whenever the pending list changes, in this tab or another.
 * Returns the function that stops listening.
 */
export function onPendingChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === PENDING_KEY || e.key === null) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
