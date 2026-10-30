import { Buffer } from "buffer";
import { scValToNative } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
  IndexerClient,
  IndexerError,
  NOTHING_OWED_BPS,
  PlimsollContracts,
  TESTNET,
  Tier,
  ago,
  bpsToPercent,
  bytes32,
  coverageStatus,
  decodeCoverage,
  decodeReport,
  formatUnits,
  matchesHash,
  parseUnits,
  sacAddress,
  sha256Hex,
  shortAddress,
  tierFromName,
  tierLabel,
} from "../src/index";
import { live } from "./live";

describe("format", () => {
  it("formats smallest units", () => {
    expect(formatUnits(10_200_000_000_000n)).toBe("1,020,000");
    expect(formatUnits(15_000_000n)).toBe("1.5");
    expect(formatUnits(123_456_789n, 7, 7)).toBe("12.3456789");
    expect(formatUnits(0n)).toBe("0");
    expect(formatUnits(-25_000_000n)).toBe("-2.5");
  });

  it("parses decimal input", () => {
    expect(parseUnits("1,020,000")).toBe(10_200_000_000_000n);
    expect(parseUnits("0.0000001")).toBe(1n);
    expect(parseUnits("12")).toBe(120_000_000n);
    expect(() => parseUnits("-1")).toThrow();
    expect(() => parseUnits("1.12345678")).toThrow();
    expect(() => parseUnits("abc")).toThrow();
  });

  it("converts bps", () => {
    expect(bpsToPercent(10_200)).toBe("102.00%");
    expect(bpsToPercent(9_999)).toBe("99.99%");
    expect(bpsToPercent(NOTHING_OWED_BPS)).toBeNull();
  });

  it("classifies status", () => {
    expect(coverageStatus(10_000, 60)).toBe("covered");
    expect(coverageStatus(9_999, 60)).toBe("under");
    expect(coverageStatus(10_500, 40 * 86_400)).toBe("stale");
    expect(coverageStatus(null, 60)).toBe("unknown");
  });

  it("labels and shortens", () => {
    expect(tierLabel(Tier.IssuerSigned)).toBe("Issuer-signed");
    expect(tierFromName("auditor_signed")).toBe(Tier.AuditorSigned);
    expect(tierFromName("nope")).toBeUndefined();
    expect(shortAddress("GBIE3ANCRVCBWETUZXWYKRMP27LQVJHX757XXAQUT3LYHVTNFPPPXEY4")).toBe("GBIE…XEY4");
    expect(ago(30)).toBe("just now");
    expect(ago(7_200)).toBe("2 hours ago");
    expect(ago(86_400)).toBe("1 day ago");
  });
});

describe("contract helpers", () => {
  it("derives the testnet PUSD SAC address", () => {
    const { code, issuer, sac } = TESTNET.assets.PUSD!;
    expect(sacAddress(code, issuer, TESTNET.networkPassphrase)).toBe(sac);
  });

  it("rejects malformed hashes", () => {
    expect(() => bytes32("abcd")).toThrow();
    const native = scValToNative(bytes32("ab".repeat(32))) as Uint8Array;
    expect(Buffer.from(native).toString("hex")).toBe("ab".repeat(32));
  });

  it("decodes native structs", () => {
    const report = decodeReport({
      amount: 10_200_000_000_000n,
      as_of: 1_791_158_400n,
      posted_at: 1_791_196_947n,
      tier: 2,
      reporter: "GBIE3ANCRVCBWETUZXWYKRMP27LQVJHX757XXAQUT3LYHVTNFPPPXEY4",
      doc_hash: new Uint8Array(32).fill(1),
      doc_uri: "https://x",
    });
    expect(report.tier).toBe(Tier.IssuerSigned);
    expect(report.asOf).toBe(1_791_158_400);
    expect(report.docHash).toBe("01".repeat(32));

    const cov = decodeCoverage({
      bps: 10_200,
      supply: 10n,
      reserves: 11n,
      tier: 3,
      supply_ledger: 5,
      supply_timestamp: 6n,
      report_as_of: 7n,
    });
    expect(cov).toEqual({
      bps: 10_200,
      supply: 10n,
      reserves: 11n,
      tier: Tier.AuditorSigned,
      supplyLedger: 5,
      supplyTimestamp: 6,
      reportAsOf: 7,
    });
  });
});

describe("verify", () => {
  it("hashes like sha256sum", async () => {
    const body = new TextEncoder().encode("abc");
    const expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(await sha256Hex(body)).toBe(expected);
    expect(await matchesHash(body, expected.toUpperCase())).toBe(true);
    expect(await matchesHash(body, "00".repeat(32))).toBe(false);
  });
});

describe("indexer client", () => {
  const fakeFetch = (routes: Record<string, { status?: number; body: unknown }>) =>
    (async (url: string | URL | Request) => {
      const path = String(url).replace("https://idx.example", "");
      const route = routes[path];
      if (!route) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
      const body = typeof route.body === "string" ? route.body : JSON.stringify(route.body);
      return new Response(body, { status: route.status ?? 200 });
    }) as typeof fetch;

  it("lists assets and surfaces API errors", async () => {
    const client = new IndexerClient(
      "https://idx.example/",
      fakeFetch({ "/v1/assets?min_tier=1": { body: { assets: [{ code: "PUSD" }] } } }),
    );
    const assets = await client.listAssets();
    expect(assets[0]?.code).toBe("PUSD");
    await expect(client.getAsset("CNOPE")).rejects.toBeInstanceOf(IndexerError);
    await expect(client.getAsset("CNOPE")).rejects.toThrow("not found");
  });

  it("returns breakdown bytes verbatim", async () => {
    const client = new IndexerClient(
      "https://idx.example",
      fakeFetch({ "/v1/breakdowns/h": { body: '{"total":"1"}' } }),
    );
    const bytes = await client.breakdown("h");
    expect(new TextDecoder().decode(bytes)).toBe('{"total":"1"}');
  });
});

// Reads the real testnet deployment. Run with PLIMSOLL_LIVE=1.
describe.skipIf(!process.env.PLIMSOLL_LIVE)("live testnet", () => {
  const client = new PlimsollContracts(TESTNET);
  const pusd = TESTNET.assets.PUSD!.sac;

  it("reads the listed PUSD asset", async (ctx) => {
    const asset = await live(ctx, () => client.getAsset(pusd));
    expect(asset?.code).toBe("PUSD");
    expect(asset?.issuer).toBe(TESTNET.assets.PUSD!.issuer);
  });

  it("reads coverage and the issuer report", async (ctx) => {
    const cov = await live(ctx, () => client.coverage(pusd, Tier.Transcribed));
    expect(cov).not.toBeNull();
    expect(cov!.bps).toBeGreaterThan(0);
    const report = await live(ctx, () => client.getReport(pusd, Tier.IssuerSigned));
    expect(report?.reporter).toBe(TESTNET.assets.PUSD!.issuer);
    const covered = await live(ctx, () => client.isCovered(pusd, 0, 10 * 365 * 86_400, Tier.Transcribed));
    expect(covered).toBe(true);
  });

  it("reports the under-backed QUSD demo as not covered", async (ctx) => {
    const qusd = TESTNET.assets.QUSD!.sac;
    const cov = await live(ctx, () => client.coverage(qusd, Tier.Transcribed));
    expect(cov).not.toBeNull();
    expect(cov!.bps).toBeLessThan(10_000);
    expect(cov!.tier).toBe(Tier.Transcribed);
    const covered = await live(ctx, () => client.isCovered(qusd, 10_000, 10 * 365 * 86_400, Tier.Transcribed));
    expect(covered).toBe(false);
  });

  it("knows the registered supply poster", async (ctx) => {
    const info = await live(ctx, () =>
      client.getReporter("GDACI55IMI5DDZWMZ2EAXWK57AV75VE4626YYBAHQJYDV7QFPNNFK6HJ"),
    );
    expect(info?.name).toBe("Plimsoll indexer");
  });
}, 60_000);
