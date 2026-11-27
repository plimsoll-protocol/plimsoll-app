import { Buffer } from "node:buffer";
import { Account, BASE_FEE, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { Tier, type ReportPostedEvent } from "@plimsoll/sdk";
import { describe, expect, it } from "vitest";
import type { AssetView, ReportView } from "../lib/data";
import {
  PENDING_KEY,
  PENDING_TTL_MS,
  addPending,
  confirmedIn,
  loadPending,
  pendingFor,
  removePending,
  reportFromEvent,
  sameReport,
  toView,
  txHashOf,
  withReport,
  type PendingReport,
} from "../lib/pending-reports";

function memStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const NOW = 1_800_000_000_000;
const reporter = Keypair.random().publicKey();
const hashA = "aa".repeat(32);
const hashB = "bb".repeat(32);

const pending = (over: Partial<PendingReport> = {}): PendingReport => ({
  txHash: hashA,
  sac: "CSAC1",
  tier: Tier.AuditorSigned,
  amount: "10200000000000",
  asOf: 1_791_158_400,
  reporter,
  docHash: "cd".repeat(32),
  docUri: "https://example.com/attestation.pdf",
  createdAt: NOW,
  ...over,
});

const confirmed = (over: Partial<ReportView> = {}): ReportView => ({
  tier: Tier.AuditorSigned,
  amount: 10_200_000_000_000n,
  asOf: 1_791_158_400,
  postedAt: 1_791_160_000,
  reporter,
  docHash: "cd".repeat(32),
  docUri: "https://example.com/attestation.pdf",
  txHash: hashA,
  origin: "event",
  ...over,
});

const asset = (reports: AssetView["reports"] = {}): AssetView => ({
  sac: "CSAC1",
  code: "PUSD",
  issuer: Keypair.random().publicKey(),
  supply: null,
  reports,
  coverage: null,
  toml: null,
  source: "indexer",
});

describe("pending report storage", () => {
  it("adds, lists per asset and removes entries", () => {
    const store = memStore();
    addPending(pending(), store, NOW);
    addPending(pending({ txHash: hashB, sac: "CSAC2" }), store, NOW + 1);

    expect(loadPending(store, NOW)).toHaveLength(2);
    expect(pendingFor(loadPending(store, NOW), "CSAC1").map((p) => p.txHash)).toEqual([hashA]);

    removePending([hashA.toUpperCase()], store, NOW);
    expect(loadPending(store, NOW).map((p) => p.txHash)).toEqual([hashB]);
  });

  it("replaces an entry with the same transaction hash, case-insensitively", () => {
    const store = memStore();
    addPending(pending({ amount: "1" }), store, NOW);
    addPending(pending({ txHash: hashA.toUpperCase(), amount: "2" }), store, NOW);
    expect(loadPending(store, NOW)).toEqual([pending({ amount: "2" })]);
  });

  it("drops entries older than the TTL", () => {
    const store = memStore();
    addPending(pending(), store, NOW);
    expect(loadPending(store, NOW + PENDING_TTL_MS - 1)).toHaveLength(1);
    expect(loadPending(store, NOW + PENDING_TTL_MS)).toHaveLength(0);
  });

  it("survives missing, corrupt and hand-edited storage", () => {
    expect(loadPending(null, NOW)).toEqual([]);
    const store = memStore();
    store.data.set(PENDING_KEY, "{not json");
    expect(loadPending(store, NOW)).toEqual([]);
    store.data.set(PENDING_KEY, JSON.stringify({ txHash: hashA }));
    expect(loadPending(store, NOW)).toEqual([]);
    store.data.set(
      PENDING_KEY,
      JSON.stringify([pending(), { ...pending(), amount: "1.5" }, { ...pending(), tier: 9 }]),
    );
    expect(loadPending(store, NOW)).toEqual([pending()]);
  });

  it("orders an asset's entries oldest first", () => {
    const list = [pending({ txHash: hashB, createdAt: NOW + 5 }), pending()];
    expect(pendingFor(list, "CSAC1").map((p) => p.txHash)).toEqual([hashA, hashB]);
  });

  it("shapes an entry as a pending report row", () => {
    expect(toView(pending())).toEqual({
      ...confirmed({ postedAt: NOW / 1000 }),
      pending: true,
    });
  });
});

describe("reconciling pending reports", () => {
  it("matches on transaction hash when the confirmed report has one", () => {
    expect(sameReport(pending(), confirmed())).toBe(true);
    expect(sameReport(pending(), confirmed({ txHash: hashA.toUpperCase() }))).toBe(true);
    // Same fields, different transaction: a different report.
    expect(sameReport(pending(), confirmed({ txHash: hashB }))).toBe(false);
  });

  it("matches on the report's fields when there is no hash", () => {
    const chain = confirmed({ txHash: undefined, origin: "chain" });
    expect(sameReport(pending(), chain)).toBe(true);
    expect(sameReport(pending(), { ...chain, amount: 1n })).toBe(false);
    expect(sameReport(pending(), { ...chain, asOf: chain.asOf - 1 })).toBe(false);
    expect(sameReport(pending(), { ...chain, reporter: "GOTHER" })).toBe(false);
  });

  it("finds the entries a loaded asset already confirms", () => {
    const list = [pending(), pending({ txHash: hashB, tier: Tier.Transcribed })];
    expect(confirmedIn(list, asset({ [Tier.AuditorSigned]: confirmed() }))).toEqual([hashA]);
    expect(confirmedIn(list, asset())).toEqual([]);
    expect(
      confirmedIn(list, { ...asset({ [Tier.AuditorSigned]: confirmed() }), sac: "X" }),
    ).toEqual([]);
  });

  it("turns a report_posted event into a confirmed row", () => {
    const ev: ReportPostedEvent = {
      kind: "report_posted",
      sac: "CSAC1",
      tier: "auditor_signed",
      amount: "10200000000000",
      as_of: new Date(1_791_158_400_000).toISOString(),
      reporter,
      doc_hash: "cd".repeat(32),
      doc_uri: "https://example.com/attestation.pdf",
      tx_hash: hashA,
      posted_at: new Date(1_791_160_000_000).toISOString(),
    };
    const row = reportFromEvent(ev);
    expect(row).toEqual(confirmed());
    expect(sameReport(pending(), row!)).toBe(true);

    expect(reportFromEvent({ ...ev, tier: "bogus" as ReportPostedEvent["tier"] })).toBeNull();
    expect(reportFromEvent({ ...ev, amount: "1.5" })).toBeNull();
    expect(reportFromEvent({ ...ev, as_of: "not a date" })).toBeNull();
  });

  it("puts a confirmed report in its tier, never over a newer one", () => {
    const old = confirmed({ asOf: 100, txHash: hashB });
    const next = confirmed({ asOf: 200 });
    expect(withReport(asset({ [Tier.AuditorSigned]: old }), next).reports[Tier.AuditorSigned]).toBe(
      next,
    );
    const a = asset({ [Tier.AuditorSigned]: next });
    expect(withReport(a, old)).toBe(a);
    expect(withReport(asset(), next).reports[Tier.AuditorSigned]).toBe(next);
  });
});

describe("txHashOf", () => {
  it("is the hash the network will give the signed transaction", () => {
    const passphrase = "Test SDF Network ; September 2015";
    const signer = Keypair.random();
    const tx = new TransactionBuilder(new Account(signer.publicKey(), "1"), {
      fee: BASE_FEE,
      networkPassphrase: passphrase,
    })
      .addOperation(Operation.bumpSequence({ bumpTo: "2" }))
      .setTimeout(300)
      .build();
    tx.sign(signer);
    expect(txHashOf(tx.toXDR(), passphrase)).toBe(Buffer.from(tx.hash()).toString("hex"));
    expect(txHashOf(tx.toXDR(), passphrase)).toMatch(/^[0-9a-f]{64}$/);
  });
});
