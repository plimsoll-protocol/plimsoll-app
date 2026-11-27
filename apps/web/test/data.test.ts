import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTHING_OWED_BPS, Tier, type IndexerAsset } from "@plimsoll/sdk";
import {
  fromIndexer,
  getContracts,
  indexer,
  loadAsset,
  loadAssets,
  loadReporterNames,
} from "../lib/data";
import { ratioText, statusOf } from "../components/ui";

// No network: every client method used is stubbed, and the console is silenced
// for the expected fallback warnings.
const SAC = "CSAC";
const contracts = await getContracts();

const indexed = (over: Partial<IndexerAsset> = {}): IndexerAsset => ({
  sac: SAC,
  code: "PUSD",
  issuer: "GISSUER",
  listed_ledger: 1,
  listed_at: "2026-01-01T00:00:00Z",
  toml: null,
  supply: {
    amount: "1000",
    ledger: 5,
    posted_at: "2026-01-02T00:00:00Z",
    breakdown_hash: "bh",
    poster: "GP",
    tx_hash: "tx1",
  },
  reports: {
    transcribed: {
      tier: "transcribed",
      amount: "1000",
      as_of: "2026-01-02T00:00:00Z",
      posted_at: "2026-01-02T00:00:10Z",
      reporter: "GR",
      doc_hash: "dh",
      doc_uri: "https://example.com/r.pdf",
      tx_hash: "",
      source: "chain",
    },
  },
  coverage: {
    bps: 10_000,
    ratio: "1",
    tier: "transcribed",
    supply: "1000",
    reserves: "1000",
    supply_ledger: 5,
    supply_posted_at: "2026-01-02T00:00:00Z",
    report_as_of: "2026-01-02T00:00:00Z",
    report_age_seconds: 1,
    supply_age_seconds: 1,
    reporter: "GR",
    doc_uri: "https://example.com/r.pdf",
  },
  ...over,
});

const chainAsset = { sac: SAC, code: "PUSD", issuer: "GISSUER", listedAt: 1 };

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("fromIndexer", () => {
  it("maps figures, times and origin", () => {
    const v = fromIndexer(indexed());
    expect(v.source).toBe("indexer");
    expect(v.supply).toMatchObject({
      amount: 1000n,
      postedAt: Date.parse("2026-01-02T00:00:00Z") / 1000,
      txHash: "tx1",
      origin: "event",
    });
    expect(v.reports[Tier.Transcribed]).toMatchObject({
      amount: 1000n,
      origin: "chain",
      docUri: "https://example.com/r.pdf",
    });
    expect(v.coverage).toMatchObject({ bps: 10_000, supply: 1000n, reserves: 1000n });
  });

  it("maps bps null to the nothing-owed sentinel", () => {
    const a = indexed();
    a.coverage = { ...a.coverage!, bps: null, ratio: null };
    expect(fromIndexer(a).coverage?.bps).toBe(NOTHING_OWED_BPS);
  });

  it("handles missing supply and coverage and skips unknown tiers", () => {
    const a = indexed({ supply: null, coverage: null });
    (a.reports as Record<string, unknown>).bogus = { ...a.reports.transcribed, tier: "bogus" };
    const v = fromIndexer(a);
    expect(v.supply).toBeNull();
    expect(v.coverage).toBeNull();
    expect(Object.keys(v.reports)).toHaveLength(1);
  });
});

describe("loadAssets fallback", () => {
  const stubChain = () => {
    vi.spyOn(contracts, "getAsset").mockResolvedValue(chainAsset as never);
    vi.spyOn(contracts, "getSupply").mockResolvedValue(null);
    vi.spyOn(contracts, "coverage").mockResolvedValue(null);
    vi.spyOn(contracts, "getReports").mockResolvedValue([]);
  };

  it("uses the indexer when it answers", async () => {
    const chain = vi.spyOn(contracts, "getAsset");
    vi.spyOn(indexer!, "listAssets").mockResolvedValue([indexed()]);
    const all = await loadAssets();
    expect(all).toHaveLength(1);
    expect(all[0]!.source).toBe("indexer");
    expect(chain).not.toHaveBeenCalled();
  });

  it("falls back to the chain when the indexer errors", async () => {
    vi.spyOn(indexer!, "listAssets").mockRejectedValue(new Error("down"));
    stubChain();
    const all = await loadAssets();
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((a) => a.source === "chain")).toBe(true);
  });

  it("falls back to the chain when the indexer is empty", async () => {
    vi.spyOn(indexer!, "listAssets").mockResolvedValue([]);
    stubChain();
    const all = await loadAssets();
    expect(all.length).toBeGreaterThan(0);
    expect(all[0]!.source).toBe("chain");
  });

  it("drops chain assets that fail to load", async () => {
    vi.spyOn(indexer!, "listAssets").mockResolvedValue([]);
    vi.spyOn(contracts, "getAsset").mockRejectedValue(new Error("rpc"));
    expect(await loadAssets()).toEqual([]);
  });
});

describe("loadAsset fallback", () => {
  it("uses the indexer when ok", async () => {
    vi.spyOn(indexer!, "getAsset").mockResolvedValue(indexed());
    expect((await loadAsset(SAC))?.source).toBe("indexer");
  });

  it("falls back to the chain on an indexer error", async () => {
    vi.spyOn(indexer!, "getAsset").mockRejectedValue(new Error("404"));
    vi.spyOn(contracts, "getAsset").mockResolvedValue(chainAsset as never);
    vi.spyOn(contracts, "getSupply").mockResolvedValue(null);
    vi.spyOn(contracts, "coverage").mockResolvedValue(null);
    vi.spyOn(contracts, "getReports").mockResolvedValue([]);
    expect((await loadAsset(SAC))?.source).toBe("chain");
  });

  it("returns null when the chain does not know the asset", async () => {
    vi.spyOn(indexer!, "getAsset").mockRejectedValue(new Error("404"));
    vi.spyOn(contracts, "getAsset").mockResolvedValue(null);
    expect(await loadAsset(SAC)).toBeNull();
  });
});

describe("loadReporterNames caching", () => {
  it("asks once, caches names and absent names, and reads the chain for the rest", async () => {
    const list = vi
      .spyOn(indexer!, "reporters")
      .mockResolvedValue([{ address: "GA", role: "auditor", name: "Alice Audit", updated_at: "" }]);
    const chain = vi.spyOn(contracts, "getReporter");

    const first = await loadReporterNames(["GA", "GB", "GA", ""]);
    expect(first.get("GA")).toBe("Alice Audit");
    expect(first.has("GB")).toBe(false);
    expect(list).toHaveBeenCalledTimes(1);
    expect(chain).not.toHaveBeenCalled();

    const second = await loadReporterNames(["GA", "GB"]);
    expect(second.get("GA")).toBe("Alice Audit");
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("falls back to the chain when the indexer fails, and does not cache failed reads", async () => {
    vi.spyOn(indexer!, "reporters").mockRejectedValue(new Error("down"));
    const chain = vi
      .spyOn(contracts, "getReporter")
      .mockResolvedValueOnce({ name: "Chain Name" } as never)
      .mockRejectedValueOnce(new Error("rpc"))
      .mockResolvedValueOnce({ name: "Later" } as never);

    const out = await loadReporterNames(["GC", "GD"]);
    expect(out.get("GC")).toBe("Chain Name");
    expect(out.has("GD")).toBe(false);

    const again = await loadReporterNames(["GC", "GD"]);
    expect(again.get("GD")).toBe("Later");
    expect(chain).toHaveBeenCalledTimes(3);
  });
});

describe("status helpers", () => {
  const now = 1_000_000;
  it("statusOf", () => {
    expect(statusOf(undefined, now, now, now)).toBe("unknown");
    expect(statusOf(10_000, undefined, now, now)).toBe("unknown");
    expect(statusOf(10_000, now - 10, now - 10, now)).toBe("covered");
    expect(statusOf(9_000, now - 10, undefined, now)).toBe("under");
    expect(statusOf(10_000, now - 10_000_000, now, now)).toBe("stale");
    expect(statusOf(NOTHING_OWED_BPS, now - 10, now - 10, now)).toBe("covered");
  });

  it("ratioText", () => {
    expect(ratioText(undefined)).toBe("—");
    expect(ratioText(10_000)).toBe("100.00%");
    expect(ratioText(NOTHING_OWED_BPS)).toBe("No supply");
  });
});
