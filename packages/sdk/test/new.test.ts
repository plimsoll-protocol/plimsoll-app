import { Address, nativeToScVal, rpc, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  ContractCallError,
  CoveredVaultClient,
  LedgerError,
  PlimsollContracts,
  RegistryError,
  TESTNET,
  Tier,
  VaultError,
  decodeVaultConfig,
  describeError,
  parseContractErrorCode,
} from "../src/index";
import { live } from "./live";

const config = { ...TESTNET, rpcUrl: "http://127.0.0.1:9" };
const sac = TESTNET.assets.PUSD!.sac;

const simOk = (retval: xdr.ScVal) =>
  ({
    _parsed: true,
    id: "1",
    latestLedger: 1,
    events: [],
    transactionData: {},
    minResourceFee: "100",
    result: { auth: [], retval },
  }) as unknown as rpc.Api.SimulateTransactionResponse;

const reportScVal = (tier: number, amount: bigint) =>
  nativeToScVal(
    {
      amount,
      as_of: 1_700_000_000n,
      posted_at: 1_700_000_100n,
      tier,
      reporter: sac,
      doc_hash: Buffer.alloc(32, 7),
      doc_uri: "https://example.com/r.pdf",
    },
    {
      type: {
        amount: ["symbol", "i128"],
        as_of: ["symbol", "u64"],
        posted_at: ["symbol", "u64"],
        tier: ["symbol", "u32"],
        reporter: ["symbol", "address"],
        doc_hash: ["symbol", "bytes"],
        doc_uri: ["symbol", "string"],
      },
    },
  );

describe("getReports", () => {
  it("decodes every tier in one simulation", async () => {
    const client = new PlimsollContracts(config);
    const sim = vi
      .spyOn(client.server, "simulateTransaction")
      .mockResolvedValue(simOk(xdr.ScVal.scvVec([reportScVal(1, 5n), reportScVal(3, 9n)])));
    const out = await client.getReports(sac);
    expect(sim).toHaveBeenCalledOnce();
    expect(out.map((r) => [r.tier, r.amount])).toEqual([
      [1, 5n],
      [3, 9n],
    ]);
    expect(out[0]?.docHash).toBe("07".repeat(32));
  });

  it("returns an empty list when nothing is returned", async () => {
    const client = new PlimsollContracts(config);
    vi.spyOn(client.server, "simulateTransaction").mockResolvedValue(simOk(xdr.ScVal.scvVec([])));
    await expect(client.getReports(sac)).resolves.toEqual([]);
  });
});

describe("typed contract errors", () => {
  it("pins the enum values to the contract specs", () => {
    expect(LedgerError).toMatchObject({
      NotAStellarAsset: 1,
      AlreadyListed: 2,
      AssetNotListed: 3,
      NotSupplyPoster: 4,
      NotReporter: 5,
      InvalidAmount: 6,
      FutureLedger: 7,
      StaleLedger: 8,
      FutureTimestamp: 9,
      StaleReport: 10,
      InvalidUri: 11,
    });
    expect(RegistryError).toMatchObject({ ReporterNotFound: 1, InvalidName: 2 });
    expect(VaultError).toMatchObject({ InvalidAmount: 1, NotCovered: 2, InsufficientBalance: 3 });
  });

  it("sets code for contract errors only", () => {
    expect(new ContractCallError("m", "HostError: Error(Contract, #5)").code).toBe(5);
    expect(new ContractCallError("m", "status ERROR").code).toBeUndefined();
    expect(parseContractErrorCode("Error(Contract, #11)")).toBe(11);
    expect(parseContractErrorCode("Error(Contract, #12)")).toBe(12);
    expect(parseContractErrorCode("Error(Contract, #13)")).toBe(13);
    expect(parseContractErrorCode("Error(Storage, MissingValue)")).toBeUndefined();
  });

  it("describes known codes per contract", () => {
    expect(describeError(LedgerError.NotReporter)).toContain("not the issuer");
    expect(describeError(LedgerError.ImplausibleAmount)).toContain("0.01% to 10,000%");
    expect(describeError(LedgerError.TooManyReporters)).toContain("maximum of 4 active reporters");
    expect(describeError(VaultError.NotCovered, "vault")).toContain("not covered");
    expect(describeError(99)).toBeUndefined();
  });
});

describe("CoveredVaultClient", () => {
  const vaultId = TESTNET.coveredVaultId;
  const cfgScVal = nativeToScVal(
    {
      ledger: new Address(TESTNET.coverageLedgerId),
      asset: new Address(sac),
      min_bps: 10_000,
      max_age: 604_800n,
      min_tier: 2,
    },
    {
      type: {
        ledger: ["symbol", "address"],
        asset: ["symbol", "address"],
        min_bps: ["symbol", "u32"],
        max_age: ["symbol", "u64"],
        min_tier: ["symbol", "u32"],
      },
    },
  );

  it("decodes VaultConfig", () => {
    expect(
      decodeVaultConfig({
        ledger: "L",
        asset: "A",
        min_bps: 10_000,
        max_age: 604_800n,
        min_tier: 2,
      }),
    ).toEqual({
      ledger: "L",
      asset: "A",
      minBps: 10_000,
      maxAge: 604_800,
      minTier: Tier.IssuerSigned,
    });
  });

  it("reads config and balance through simulation", async () => {
    const client = new CoveredVaultClient(config, vaultId);
    const sim = vi.spyOn(client.server, "simulateTransaction");
    sim.mockResolvedValueOnce(simOk(cfgScVal));
    const cfg = await client.config();
    expect(cfg).toMatchObject({ ledger: TESTNET.coverageLedgerId, asset: sac, minBps: 10_000 });

    sim.mockResolvedValueOnce(simOk(nativeToScVal(1_000_000_000n, { type: "i128" })));
    await expect(client.balance(sac)).resolves.toBe(1_000_000_000n);
  });

  it("prepares deposit and withdraw as unsigned XDR", async () => {
    const { Account, Keypair, TransactionBuilder } = await import("@stellar/stellar-sdk");
    const from = Keypair.random().publicKey();
    const client = new CoveredVaultClient(config, vaultId);
    vi.spyOn(client.server, "getAccount").mockResolvedValue(new Account(from, "1"));
    vi.spyOn(client.server, "prepareTransaction").mockImplementation(async (tx) => tx as never);
    for (const [fn, name] of [
      [() => client.prepareDeposit(from, 5n), "deposit"],
      [() => client.prepareWithdraw(from, 5n), "withdraw"],
    ] as const) {
      const out = await fn();
      const tx = TransactionBuilder.fromXDR(out, config.networkPassphrase) as Transaction;
      expect(tx.operations[0]?.type).toBe("invokeHostFunction");
      expect(Buffer.from(out, "base64").includes(Buffer.from(name))).toBe(true);
    }
  });
});

describe.skipIf(!process.env.PLIMSOLL_LIVE)("live vault and reports", () => {
  it("reads the testnet vault config", async (ctx) => {
    const client = new CoveredVaultClient(TESTNET, TESTNET.coveredVaultId);
    const cfg = await live(ctx, () => client.config());
    expect(cfg?.ledger).toBe(TESTNET.coverageLedgerId);
    expect(cfg?.asset).toBe(TESTNET.assets.PUSD!.sac);
    expect(cfg?.minBps).toBe(10_000);
  });

  it("reads all reports for PUSD in one call", async (ctx) => {
    const client = new PlimsollContracts(TESTNET);
    const reports = await live(ctx, () => client.getReports(sac));
    expect(reports?.length).toBeGreaterThan(0);
  });
});
