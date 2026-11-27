import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ContractCallError,
  PlimsollContracts,
  Role,
  TESTNET,
  Tier,
  assertReporterName,
  estimateFee,
  isMissingFunctionError,
  parseSacName,
} from "../src/index";

// Every RPC method the client uses is stubbed on its own `server`, so nothing
// here touches the network. The RPC URL points at a closed local port as a
// backstop: a call that slipped past the stubs fails instead of reaching testnet.
const config = { ...TESTNET, rpcUrl: "http://127.0.0.1:9" };
const sac = TESTNET.assets.PUSD!.sac;

type Sim = rpc.Api.SimulateTransactionResponse;

const simSuccess = (retval?: xdr.ScVal): Sim =>
  ({
    _parsed: true,
    id: "1",
    latestLedger: 100,
    events: [],
    transactionData: {},
    minResourceFee: "100",
    ...(retval ? { result: { auth: [], retval } } : {}),
  }) as unknown as Sim;

const simError = (error: string): Sim =>
  ({ _parsed: true, id: "1", latestLedger: 100, events: [], error }) as unknown as Sim;

const sent = (status: rpc.Api.SendTransactionStatus): rpc.Api.SendTransactionResponse => ({
  status,
  hash: "ab".repeat(32),
  latestLedger: 100,
  latestLedgerCloseTime: 1_700_000_000,
});

const polled = (status: rpc.Api.GetTransactionStatus): rpc.Api.GetTransactionResponse =>
  ({
    status,
    txHash: "ab".repeat(32),
    latestLedger: 101,
  }) as unknown as rpc.Api.GetTransactionResponse;

/** A signed transaction, as a wallet would hand it back. */
function signedXdr(): string {
  const signer = Keypair.random();
  const tx = new TransactionBuilder(new Account(signer.publicKey(), "1"), {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(Operation.bumpSequence({ bumpTo: "2" }))
    .setTimeout(300)
    .build();
  tx.sign(signer);
  return tx.toXDR();
}

type Invocation = {
  func: {
    invokeContract: {
      contractAddress: xdr.ScAddress;
      functionName: xdr.ScSymbol;
      args: xdr.ScVal[];
    };
  };
};

function invocationOf(prepared: string): Invocation {
  const tx = TransactionBuilder.fromXDR(prepared, config.networkPassphrase) as Transaction;
  return (tx.operations[0] as unknown as Invocation).func.invokeContract;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlimsollContracts reads", () => {
  it("decodes a successful simulation", async () => {
    const client = new PlimsollContracts(config);
    const simulate = vi.spyOn(client.server, "simulateTransaction").mockResolvedValue(
      simSuccess(
        nativeToScVal(
          {
            bps: 10_200,
            supply: 10_000_000_000_000n,
            reserves: 10_200_000_000_000n,
            tier: 2,
            supply_ledger: 5_034_657,
            supply_timestamp: 1_791_196_882n,
            report_as_of: 1_791_158_400n,
          },
          {
            type: {
              bps: ["symbol", "u32"],
              supply: ["symbol", "i128"],
              reserves: ["symbol", "i128"],
              tier: ["symbol", "u32"],
              supply_ledger: ["symbol", "u32"],
              supply_timestamp: ["symbol", "u64"],
              report_as_of: ["symbol", "u64"],
            },
          },
        ),
      ),
    );

    await expect(client.coverage(sac, Tier.Transcribed)).resolves.toEqual({
      bps: 10_200,
      supply: 10_000_000_000_000n,
      reserves: 10_200_000_000_000n,
      tier: Tier.IssuerSigned,
      supplyLedger: 5_034_657,
      supplyTimestamp: 1_791_196_882,
      reportAsOf: 1_791_158_400,
    });
    expect(simulate).toHaveBeenCalledOnce();
  });

  it("returns the boolean from is_covered", async () => {
    const client = new PlimsollContracts(config);
    vi.spyOn(client.server, "simulateTransaction").mockResolvedValue(
      simSuccess(nativeToScVal(true)),
    );
    await expect(client.isCovered(sac, 10_000, 7 * 86_400, Tier.IssuerSigned)).resolves.toBe(true);
  });

  it("returns null when the contract returns nothing", async () => {
    const client = new PlimsollContracts(config);
    const simulate = vi.spyOn(client.server, "simulateTransaction");

    // The contract returned None.
    simulate.mockResolvedValueOnce(simSuccess(xdr.ScVal.scvVoid()));
    await expect(client.getAsset(sac)).resolves.toBeNull();

    // The simulation carried no return value at all.
    simulate.mockResolvedValueOnce(simSuccess());
    await expect(client.getReport(sac, Tier.AuditorSigned)).resolves.toBeNull();

    // A missing value is not a yes.
    simulate.mockResolvedValueOnce(simSuccess());
    await expect(client.isCovered(sac, 10_000, 86_400, Tier.Transcribed)).resolves.toBe(false);
  });

  it("throws ContractCallError when the simulation fails", async () => {
    const client = new PlimsollContracts(config);
    vi.spyOn(client.server, "simulateTransaction").mockResolvedValue(
      simError("HostError: Error(Contract, #3)"),
    );
    const err = await client.coverage(sac, Tier.Transcribed).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContractCallError);
    expect(err).toMatchObject({ method: "coverage", detail: "HostError: Error(Contract, #3)" });
    expect(String(err)).toContain("Error(Contract, #3)");
  });

  it("reads both admin addresses", async () => {
    const client = new PlimsollContracts(config);
    const admin = Keypair.random().publicKey();
    const retval = new Address(admin).toScVal();
    const simulate = vi
      .spyOn(client.server, "simulateTransaction")
      .mockResolvedValueOnce(simSuccess(retval))
      .mockResolvedValueOnce(simSuccess(retval));

    await expect(client.registryAdmin()).resolves.toBe(admin);
    await expect(client.ledgerAdmin()).resolves.toBe(admin);
    expect(simulate).toHaveBeenCalledTimes(2);
  });
});

describe("PlimsollContracts writes", () => {
  const source = Keypair.random().publicKey();

  it("returns the prepared transaction as XDR", async () => {
    const client = new PlimsollContracts(config);
    vi.spyOn(client.server, "getAccount").mockResolvedValue(new Account(source, "41"));
    const prepare = vi
      .spyOn(client.server, "prepareTransaction")
      .mockImplementation(async (tx) => tx as Transaction);

    const out = await client.prepareListAsset(source, sac);
    const tx = TransactionBuilder.fromXDR(out, config.networkPassphrase);
    expect(prepare).toHaveBeenCalledOnce();
    expect(tx).toBeInstanceOf(Transaction);
    expect((tx as Transaction).source).toBe(source);
    expect((tx as Transaction).sequence).toBe("42");
  });

  it("prepares a report dispute from the watcher with the asset and u64 timestamp", async () => {
    const client = new PlimsollContracts(config);
    vi.spyOn(client.server, "getAccount").mockResolvedValue(new Account(source, "1"));
    vi.spyOn(client.server, "prepareTransaction").mockImplementation(
      async (tx) => tx as Transaction,
    );

    const asOf = 1_700_000_000n;
    const out = await client.prepareDisputeReport(source, sac, asOf);
    const tx = TransactionBuilder.fromXDR(out, config.networkPassphrase) as Transaction;
    const call = invocationOf(out);
    expect(tx.source).toBe(source);
    expect(tx.signatures).toHaveLength(0);
    expect(Address.fromScAddress(call.contractAddress).toString()).toBe(config.coverageLedgerId);
    expect(call.functionName.toString()).toBe("dispute_report");
    expect(call.args).toEqual([
      Address.fromString(source).toScVal(),
      Address.fromString(sac).toScVal(),
      nativeToScVal(asOf, { type: "u64" }),
    ]);
  });

  it("encodes set_reporter with the admin as source", async () => {
    const client = new PlimsollContracts(config);
    const admin = Keypair.random().publicKey();
    const reporter = Keypair.random().publicKey();
    vi.spyOn(client.server, "getAccount").mockResolvedValue(new Account(admin, "1"));
    vi.spyOn(client.server, "prepareTransaction").mockImplementation(async (tx) => tx as never);

    const out = await client.prepareSetReporter(admin, reporter, Role.Auditor, "Acme Audit LLP");
    const call = invocationOf(out);
    expect(Address.fromScAddress(call.contractAddress).toString()).toBe(config.reporterRegistryId);
    expect(String(call.functionName)).toBe("set_reporter");
    expect(call.args).toHaveLength(3);
    expect(scValToNative(call.args[0]!)).toBe(reporter);
    expect(scValToNative(call.args[1]!)).toBe(Role.Auditor);
    expect(scValToNative(call.args[2]!)).toBe("Acme Audit LLP");
    const tx = TransactionBuilder.fromXDR(out, config.networkPassphrase) as Transaction;
    expect(tx.source).toBe(admin);
  });

  it("encodes revoke with the reporter address", async () => {
    const client = new PlimsollContracts(config);
    const admin = Keypair.random().publicKey();
    const reporter = Keypair.random().publicKey();
    vi.spyOn(client.server, "getAccount").mockResolvedValue(new Account(admin, "1"));
    vi.spyOn(client.server, "prepareTransaction").mockImplementation(async (tx) => tx as never);

    const out = await client.prepareRevoke(admin, reporter);
    const call = invocationOf(out);
    expect(String(call.functionName)).toBe("revoke");
    expect(call.args).toHaveLength(1);
    expect(scValToNative(call.args[0]!)).toBe(reporter);
  });

  it("validates names by UTF-8 byte length before preparing", async () => {
    const client = new PlimsollContracts(config);
    const admin = Keypair.random().publicKey();
    const reporter = Keypair.random().publicKey();
    const getAccount = vi.spyOn(client.server, "getAccount");

    for (const name of ["", "a".repeat(65), "é".repeat(33)]) {
      await expect(
        client.prepareSetReporter(admin, reporter, Role.Transcriber, name),
      ).rejects.toThrow(/64 bytes/);
    }
    expect(() => assertReporterName("é".repeat(32))).not.toThrow();
    expect(getAccount).not.toHaveBeenCalled();
  });

  it("wraps a prepare failure in ContractCallError", async () => {
    const client = new PlimsollContracts(config);
    vi.spyOn(client.server, "getAccount").mockResolvedValue(new Account(source, "41"));
    vi.spyOn(client.server, "prepareTransaction").mockRejectedValue(
      new Error("simulation failed: Error(Contract, #5)"),
    );

    const err = await client.prepareListAsset(source, sac).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContractCallError);
    expect(err).toMatchObject({ method: "prepare" });
    expect(String(err)).toContain("Error(Contract, #5)");
  });

  it("submits, polls and returns the hash", async () => {
    const client = new PlimsollContracts(config);
    vi.spyOn(client.server, "sendTransaction").mockResolvedValue(sent("PENDING"));
    const poll = vi
      .spyOn(client.server, "pollTransaction")
      .mockResolvedValue(polled(rpc.Api.GetTransactionStatus.SUCCESS));

    await expect(client.submit(signedXdr())).resolves.toBe("ab".repeat(32));
    expect(poll).toHaveBeenCalledWith("ab".repeat(32), { attempts: 30 });
  });

  it.each(["ERROR", "TRY_AGAIN_LATER"] as const)(
    "throws without polling when the RPC answers %s",
    async (status) => {
      const client = new PlimsollContracts(config);
      vi.spyOn(client.server, "sendTransaction").mockResolvedValue(sent(status));
      const poll = vi.spyOn(client.server, "pollTransaction");

      const err = await client.submit(signedXdr(), { retryDelayMs: 0 }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ContractCallError);
      expect(String(err)).toContain(`status ${status}`);
      expect(poll).not.toHaveBeenCalled();
    },
  );

  it("throws when the transaction lands as failed", async () => {
    const client = new PlimsollContracts(config);
    vi.spyOn(client.server, "sendTransaction").mockResolvedValue(sent("PENDING"));
    vi.spyOn(client.server, "pollTransaction").mockResolvedValue(
      polled(rpc.Api.GetTransactionStatus.FAILED),
    );

    const err = await client.submit(signedXdr()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContractCallError);
    expect(String(err)).toContain(`transaction ${"ab".repeat(32)} FAILED`);
  });

  it("retries TRY_AGAIN_LATER then succeeds", async () => {
    const client = new PlimsollContracts(config);
    const send = vi
      .spyOn(client.server, "sendTransaction")
      .mockResolvedValueOnce(sent("TRY_AGAIN_LATER"))
      .mockResolvedValueOnce(sent("TRY_AGAIN_LATER"))
      .mockResolvedValueOnce(sent("PENDING"));
    vi.spyOn(client.server, "pollTransaction").mockResolvedValue(
      polled(rpc.Api.GetTransactionStatus.SUCCESS),
    );
    await expect(client.submit(signedXdr(), { retryDelayMs: 0 })).resolves.toBe("ab".repeat(32));
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("surfaces TRY_AGAIN_LATER after the retries are used up", async () => {
    const client = new PlimsollContracts(config);
    const send = vi
      .spyOn(client.server, "sendTransaction")
      .mockResolvedValue(sent("TRY_AGAIN_LATER"));
    const err = await client
      .submit(signedXdr(), { retries: 2, retryDelayMs: 0 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContractCallError);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("does not retry ERROR and includes the result XDR", async () => {
    const client = new PlimsollContracts(config);
    const errorResult = xdr.TransactionResult.fromXDR(
      "AAAAAAAAAGT/////AAAAAQAAAAAAAAAB////+wAAAAA=",
      "base64",
    );
    const send = vi
      .spyOn(client.server, "sendTransaction")
      .mockResolvedValue({ ...sent("ERROR"), errorResult });
    const err = (await client
      .submit(signedXdr(), { retryDelayMs: 0 })
      .catch((e: unknown) => e)) as ContractCallError;
    expect(send).toHaveBeenCalledTimes(1);
    expect(err.resultXdr).toBe(errorResult.toXDR("base64"));
  });

  it("applies fee and timeout options to prepared transactions", async () => {
    const client = new PlimsollContracts(config);
    const source = Keypair.random().publicKey();
    vi.spyOn(client.server, "getAccount").mockResolvedValue(new Account(source, "1"));
    const prep = vi
      .spyOn(client.server, "prepareTransaction")
      .mockImplementation(async (tx) => tx as never);
    await client.prepareListAsset(source, sac, { fee: "5000", timeoutSeconds: 60 });
    const tx = prep.mock.calls[0]![0] as Transaction;
    expect(tx.fee).toBe("5000");
    expect(Number(tx.timeBounds!.maxTime) - Math.floor(Date.now() / 1000)).toBeGreaterThanOrEqual(
      55,
    );
    expect(Number(tx.timeBounds!.maxTime) - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(60);
    await client.prepareListAsset(source, sac);
    const d = prep.mock.calls[1]![0] as Transaction;
    expect(d.fee).toBe(BASE_FEE);
    expect(Number(d.timeBounds!.maxTime) - Math.floor(Date.now() / 1000)).toBeGreaterThanOrEqual(
      295,
    );
    expect(Number(d.timeBounds!.maxTime) - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(300);
  });
});

describe("estimateFee", () => {
  it("returns resource fee in stroops from simulation", async () => {
    const client = new PlimsollContracts(config);
    vi.spyOn(client.server, "simulateTransaction").mockResolvedValue(simSuccess());
    const op = client.ledger.call("get_asset", nativeToScVal(sac, { type: "address" }));
    const fee = await client.estimateFee(op);
    expect(fee).toBe(100);
  });

  it("returns 0 on simulation error without throwing", async () => {
    const client = new PlimsollContracts(config);
    vi.spyOn(client.server, "simulateTransaction").mockResolvedValue(simError("Simulation failed"));
    const op = client.ledger.call("get_asset", nativeToScVal(sac, { type: "address" }));
    const fee = await client.estimateFee(op);
    expect(fee).toBe(0);
  });

  it("returns 0 when simulation throws an exception", async () => {
    const client = new PlimsollContracts(config);
    vi.spyOn(client.server, "simulateTransaction").mockRejectedValue(new Error("Network error"));
    const op = client.ledger.call("get_asset", nativeToScVal(sac, { type: "address" }));
    const fee = await client.estimateFee(op);
    expect(fee).toBe(0);
  });

  it("works with top-level estimateFee function", async () => {
    const server = new rpc.Server("http://127.0.0.1:9");
    vi.spyOn(server, "simulateTransaction").mockResolvedValue({
      ...simSuccess(),
      minResourceFee: "250",
    } as unknown as rpc.Api.SimulateTransactionResponse);
    const client = new PlimsollContracts(config);
    const op = client.ledger.call("get_asset", nativeToScVal(sac, { type: "address" }));
    const fee = await estimateFee(op, server, config.networkPassphrase);
    expect(fee).toBe(250);
describe("getAssetMetadata", () => {
  const pusd = TESTNET.assets.PUSD!;
  const metaScVal = (fields: Record<string, string>) =>
    nativeToScVal(fields, {
      type: Object.fromEntries(Object.keys(fields).map((k) => [k, ["symbol", "string"]])),
    });
  const missingFn = simError(
    "HostError: Error(WasmVm, MissingValue)\n\nEvent log (newest first):\n" +
      '   0: [Diagnostic Event] data:["trying to invoke non-existent contract function", asset_metadata]',
  );
  /** Contract id and function name of the call a simulation was asked to run. */
  const calledOf = (call: unknown[]) => {
    const inv = (call[0] as Transaction).operations[0] as unknown as Invocation;
    return {
      contract: Address.fromScAddress(inv.func.invokeContract.contractAddress).toString(),
      fn: inv.func.invokeContract.functionName.toString(),
    };
  };

  it("returns the ledger's asset_metadata when the contract has it", async () => {
    const client = new PlimsollContracts(config);
    const simulate = vi
      .spyOn(client.server, "simulateTransaction")
      .mockResolvedValue(
        simSuccess(
          metaScVal({ code: pusd.code, issuer: pusd.issuer, display_name: "Plimsoll USD" }),
        ),
      );

    await expect(client.getAssetMetadata(pusd.sac)).resolves.toEqual({
      code: "PUSD",
      issuer: pusd.issuer,
      displayName: "Plimsoll USD",
    });
    expect(simulate).toHaveBeenCalledOnce();
    expect(calledOf(simulate.mock.calls[0]!)).toEqual({
      contract: config.coverageLedgerId,
      fn: "asset_metadata",
    });
  });

  it("uses the code when asset_metadata has a blank display name", async () => {
    const client = new PlimsollContracts(config);
    vi.spyOn(client.server, "simulateTransaction").mockResolvedValue(
      simSuccess(metaScVal({ code: pusd.code, issuer: pusd.issuer, display_name: "  " })),
    );
    await expect(client.getAssetMetadata(pusd.sac)).resolves.toMatchObject({
      displayName: "PUSD",
    });
  });

  it("falls back to the SAC's name() when asset_metadata is not deployed", async () => {
    const client = new PlimsollContracts(config);
    const simulate = vi
      .spyOn(client.server, "simulateTransaction")
      .mockResolvedValueOnce(missingFn)
      .mockResolvedValueOnce(
        simSuccess(nativeToScVal(`${pusd.code}:${pusd.issuer}`, { type: "string" })),
      );

    await expect(client.getAssetMetadata(pusd.sac)).resolves.toEqual({
      code: "PUSD",
      issuer: pusd.issuer,
      displayName: "PUSD",
    });
    expect(simulate).toHaveBeenCalledTimes(2);
    expect(calledOf(simulate.mock.calls[1]!)).toEqual({ contract: pusd.sac, fn: "name" });
  });

  it("falls back when asset_metadata returns nothing", async () => {
    const client = new PlimsollContracts(config);
    vi.spyOn(client.server, "simulateTransaction")
      .mockResolvedValueOnce(simSuccess(xdr.ScVal.scvVoid()))
      .mockResolvedValueOnce(
        simSuccess(nativeToScVal(`${pusd.code}:${pusd.issuer}`, { type: "string" })),
      );
    await expect(client.getAssetMetadata(pusd.sac)).resolves.toMatchObject({ code: "PUSD" });
  });

  it("reads the native asset's SAC as XLM with no issuer", async () => {
    const client = new PlimsollContracts(config);
    const native = Asset.native().contractId(config.networkPassphrase);
    vi.spyOn(client.server, "simulateTransaction")
      .mockResolvedValueOnce(missingFn)
      .mockResolvedValueOnce(simSuccess(nativeToScVal("native", { type: "string" })));
    await expect(client.getAssetMetadata(native)).resolves.toEqual({
      code: "XLM",
      issuer: "",
      displayName: "XLM",
    });
  });

  it("refuses a name that does not belong to the contract it came from", async () => {
    const client = new PlimsollContracts(config);
    const usdc = TESTNET.assets.USDC!;
    vi.spyOn(client.server, "simulateTransaction")
      .mockResolvedValueOnce(missingFn)
      // The PUSD address claiming to be USDC.
      .mockResolvedValueOnce(
        simSuccess(nativeToScVal(`${usdc.code}:${usdc.issuer}`, { type: "string" })),
      );
    await expect(client.getAssetMetadata(pusd.sac)).rejects.toThrow(
      /is not the Stellar Asset Contract for USDC/,
    );
  });

  it("does not mask a contract error from asset_metadata", async () => {
    const client = new PlimsollContracts(config);
    const simulate = vi
      .spyOn(client.server, "simulateTransaction")
      .mockResolvedValue(simError("HostError: Error(Contract, #3)"));
    const err = await client.getAssetMetadata(pusd.sac).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContractCallError);
    expect(err).toMatchObject({ method: "asset_metadata", code: 3 });
    expect(simulate).toHaveBeenCalledOnce();
  });
});

describe("asset metadata helpers", () => {
  it("parses SAC names", () => {
    const issuer = TESTNET.assets.PUSD!.issuer;
    expect(parseSacName(`PUSD:${issuer}`)).toEqual({ code: "PUSD", issuer });
    expect(parseSacName("native")).toEqual({ code: "XLM", issuer: "" });
    for (const bad of ["", "PUSD", `:${issuer}`, `TOOLONGCODE123:${issuer}`, "PUSD:GABC"]) {
      expect(() => parseSacName(bad)).toThrow(/Not a Stellar Asset Contract name/);
    }
  });

  it("recognises only a missing-function failure", () => {
    expect(
      isMissingFunctionError(
        new ContractCallError("asset_metadata", "HostError: Error(WasmVm, MissingValue)"),
      ),
    ).toBe(true);
    expect(
      isMissingFunctionError(new ContractCallError("asset_metadata", "Error(Contract, #3)")),
    ).toBe(false);
    expect(isMissingFunctionError(new Error("non-existent contract function"))).toBe(false);
  });
});
