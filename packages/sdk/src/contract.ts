import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { Buffer } from "buffer";
import { RegistryError, describeError, parseContractErrorCode } from "./errors";
import { TESTNET } from "./networks";
import type {
  AssetMeta,
  AssetRecord,
  Coverage,
  NetworkConfig,
  ReporterInfo,
  ReserveReport,
  Role,
  SupplySnapshot,
  Tier,
} from "./types";

// Read-only simulations need a syntactically valid source; it is never funded
// or used to sign.
const READ_SOURCE = Keypair.random().publicKey();

/** Thrown when a contract call fails in simulation (e.g. a contract error). */
export class ContractCallError extends Error {
  /** The contract's error number, when the failure was a contract error; otherwise undefined. */
  readonly code: number | undefined;

  constructor(
    readonly method: string,
    readonly detail: string,
    /** Base64 result XDR from the RPC, when it returned one. */
    readonly resultXdr?: string,
  ) {
    super(`${method} failed: ${detail}`);
    this.name = "ContractCallError";
    this.code = parseContractErrorCode(detail);
  }
}

/** Fee and validity window for a prepared transaction. Defaults: BASE_FEE, 300 seconds. */
export interface PrepareOptions {
  /** Base fee per operation in stroops, as a string or number. */
  fee?: string | number;
  /** Seconds the transaction stays valid. */
  timeoutSeconds?: number;
}

/** Retry behaviour for `submit` when the RPC answers TRY_AGAIN_LATER. */
export interface SubmitOptions {
  /** Retries after the first attempt. Default 3. */
  retries?: number;
  /** Delay before the first retry; doubles each time. Default 500. */
  retryDelayMs?: number;
}

/** The SAC address of a classic asset on a given network. */
export function sacAddress(code: string, issuer: string, networkPassphrase: string): string {
  return new Asset(code, issuer).contractId(networkPassphrase);
}

export const addr = (a: string) => new Address(a).toScVal();
export const u32 = (n: number) => nativeToScVal(n, { type: "u32" });
export const u64 = (n: number | bigint) => nativeToScVal(BigInt(n), { type: "u64" });
export const i128 = (n: bigint) => nativeToScVal(n, { type: "i128" });
const str = (s: string) => nativeToScVal(s, { type: "string" });

export function assertReporterName(name: string): void {
  const bytes = new TextEncoder().encode(name).length;
  if (bytes < 1 || bytes > 64) {
    throw new Error(
      describeError(RegistryError.InvalidName, "registry") ?? "Invalid reporter name",
    );
  }
}

/** 64-char hex → BytesN<32>. */
export function bytes32(hex: string): xdr.ScVal {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("Expected a 32-byte hex hash");
  return xdr.ScVal.scvBytes(Buffer.from(hex, "hex"));
}

export function toHex(v: unknown): string {
  if (v instanceof Uint8Array) return Buffer.from(v).toString("hex");
  throw new Error("Expected bytes");
}

export const num = (v: unknown): number => Number(v);
export const big = (v: unknown): bigint => BigInt(v as bigint | number | string);

// ---- decoders: scValToNative output → typed objects ------------------------

export type Raw = Record<string, unknown>;

export function decodeAsset(raw: Raw): AssetRecord {
  return {
    sac: String(raw.sac),
    code: String(raw.code),
    issuer: String(raw.issuer),
    listedAt: num(raw.listed_at),
  };
}

export function decodeSupply(raw: Raw): SupplySnapshot {
  return {
    amount: big(raw.amount),
    ledger: num(raw.ledger),
    timestamp: num(raw.timestamp),
    breakdownHash: toHex(raw.breakdown_hash),
    poster: String(raw.poster),
  };
}

export function decodeReport(raw: Raw): ReserveReport {
  return {
    amount: big(raw.amount),
    asOf: num(raw.as_of),
    postedAt: num(raw.posted_at),
    tier: num(raw.tier) as Tier,
    reporter: String(raw.reporter),
    docHash: toHex(raw.doc_hash),
    docUri: String(raw.doc_uri),
  };
}

export function decodeCoverage(raw: Raw): Coverage {
  return {
    bps: num(raw.bps),
    supply: big(raw.supply),
    reserves: big(raw.reserves),
    tier: num(raw.tier) as Tier,
    supplyLedger: num(raw.supply_ledger),
    supplyTimestamp: num(raw.supply_timestamp),
    reportAsOf: num(raw.report_as_of),
  };
}

/**
 * Decodes the coverage ledger's `asset_metadata` struct. A blank
 * `display_name` falls back to the code, so the result always has a name.
 */
export function decodeAssetMeta(raw: Raw): AssetMeta {
  const code = String(raw.code);
  const displayName = raw.display_name == null ? "" : String(raw.display_name).trim();
  return { code, issuer: String(raw.issuer), displayName: displayName || code };
}

/**
 * Parses what a Stellar Asset Contract's `name()` returns: `"CODE:ISSUER"`
 * for a classic asset, `"native"` for XLM. Throws on anything else.
 */
export function parseSacName(name: string): Pick<AssetMeta, "code" | "issuer"> {
  if (name === "native") return { code: "XLM", issuer: "" };
  const m = /^([a-zA-Z0-9]{1,12}):(G[A-Z2-7]{55})$/.exec(name);
  if (!m || !m[1] || !m[2] || !StrKey.isValidEd25519PublicKey(m[2])) {
    throw new Error(`Not a Stellar Asset Contract name: ${JSON.stringify(name)}`);
  }
  return { code: m[1], issuer: m[2] };
}

/**
 * True when a simulation failed because the contract has no function by that
 * name, as opposed to the function running and returning an error. This is
 * how the SDK tells a contract that predates a view function from one that
 * rejected the call.
 */
export function isMissingFunctionError(err: unknown): boolean {
  if (!(err instanceof ContractCallError) || err.code !== undefined) return false;
  return /non-existent contract function|Error\(WasmVm, MissingValue\)/.test(err.detail);
}

export function decodeReporter(raw: Raw): ReporterInfo {
  return { role: num(raw.role) as Role, name: String(raw.name), addedAt: num(raw.added_at) };
}

export function opt<T>(v: unknown, decode: (r: Raw) => T): T | null {
  return v == null ? null : decode(v as Raw);
}

// ---- client ----------------------------------------------------------------

export interface ReservePostArgs {
  reporter: string;
  sac: string;
  /** Smallest units. */
  amount: bigint;
  /** Unix seconds. */
  asOf: number;
  docHash: string;
  docUri: string;
}

/** Shared RPC plumbing: simulated reads and prepared (unsigned) transactions. */
export abstract class ContractClient {
  private _server: rpc.Server | undefined;

  constructor(protected readonly network: NetworkConfig) {
    this._server = undefined;
  }

  get server(): rpc.Server {
    this._server ??= new rpc.Server(this.network.rpcUrl, {
      allowHttp: this.network.rpcUrl.startsWith("http://"),
    });
    return this._server;
  }

  protected async read(contract: Contract, method: string, args: xdr.ScVal[]): Promise<unknown> {
    const tx = new TransactionBuilder(new Account(READ_SOURCE, "0"), {
      fee: BASE_FEE,
      networkPassphrase: this.network.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();
    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw new ContractCallError(method, sim.error);
    }
    const retval = sim.result?.retval;
    return retval ? scValToNative(retval) : null;
  }

  protected async prepare(
    source: string,
    op: xdr.Operation,
    opts: PrepareOptions = {},
  ): Promise<string> {
    const account = await this.server.getAccount(source);
    const tx = new TransactionBuilder(account, {
      fee: String(opts.fee ?? BASE_FEE),
      networkPassphrase: this.network.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(opts.timeoutSeconds ?? 300)
      .build();
    try {
      const prepared = await this.server.prepareTransaction(tx);
      return prepared.toXDR();
    } catch (err) {
      throw new ContractCallError("prepare", err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Estimates the resource fee in stroops for an operation using simulation.
   *
   * @param operation The operation to simulate.
   * @returns The resource fee in stroops, or 0 on simulation error.
   */
  async estimateFee(operation: xdr.Operation): Promise<number> {
    return estimateFee(operation, this.server, this.network.networkPassphrase);
  }
}

/**
 * Estimates the resource fee in stroops for an operation using simulation.
 *
 * Calls `simulateTransaction` on the given server (or TESTNET by default)
 * and returns the resource fee (`minResourceFee`) in stroops.
 * Returns 0 on simulation error or RPC exception (never throws).
 *
 * @param operation The operation to simulate.
 * @param server Optional RPC server instance to simulate on (defaults to TESTNET RPC).
 * @param networkPassphrase Optional network passphrase (defaults to TESTNET passphrase).
 * @returns The resource fee in stroops, or 0 on simulation error.
 */
export async function estimateFee(
  operation: xdr.Operation,
  server?: rpc.Server,
  networkPassphrase?: string,
): Promise<number> {
  try {
    const s =
      server ??
      new rpc.Server(TESTNET.rpcUrl, {
        allowHttp: TESTNET.rpcUrl.startsWith("http://"),
      });
    const passphrase = networkPassphrase ?? TESTNET.networkPassphrase;
    const tx = new TransactionBuilder(new Account(READ_SOURCE, "0"), {
      fee: BASE_FEE,
      networkPassphrase: passphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();
    const sim = await s.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      return 0;
    }
    return Number(sim.minResourceFee ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Reads the Plimsoll contracts through RPC simulation and builds prepared
 * transactions for the write calls. Signing is left to the caller's wallet.
 */
export class PlimsollContracts extends ContractClient {
  readonly ledger: Contract;
  readonly registry: Contract;

  constructor(readonly config: NetworkConfig) {
    super(config);
    this.ledger = new Contract(config.coverageLedgerId);
    this.registry = new Contract(config.reporterRegistryId);
  }

  // -- reads --

  async getAsset(sac: string): Promise<AssetRecord | null> {
    return opt(await this.read(this.ledger, "get_asset", [addr(sac)]), decodeAsset);
  }

  async getSupply(sac: string): Promise<SupplySnapshot | null> {
    return opt(await this.read(this.ledger, "get_supply", [addr(sac)]), decodeSupply);
  }

  /** Every tier's latest report, in one call. */
  async getReports(sac: string): Promise<ReserveReport[]> {
    const v = await this.read(this.ledger, "get_reports", [addr(sac)]);
    return Array.isArray(v) ? v.map((r) => decodeReport(r as Raw)) : [];
  }

  async getReport(sac: string, tier: Tier): Promise<ReserveReport | null> {
    return opt(await this.read(this.ledger, "get_report", [addr(sac), u32(tier)]), decodeReport);
  }

  async coverage(sac: string, minTier: Tier): Promise<Coverage | null> {
    return opt(await this.read(this.ledger, "coverage", [addr(sac), u32(minTier)]), decodeCoverage);
  }

  async isCovered(
    sac: string,
    minBps: number,
    maxAgeSeconds: number,
    minTier: Tier,
  ): Promise<boolean> {
    const v = await this.read(this.ledger, "is_covered", [
      addr(sac),
      u32(minBps),
      u64(maxAgeSeconds),
      u32(minTier),
    ]);
    return v === true;
  }

  /**
   * Code, issuer and display name of an asset, for labelling it in a UI.
   *
   * Asks the coverage ledger's `asset_metadata(sac)` view first. A ledger
   * deployed before that function existed has no such entry point; then the
   * name is read from the Stellar Asset Contract itself, whose `name()` is
   * `"CODE:ISSUER"`, and `displayName` is the code. The parsed code and issuer
   * are checked against the address they were read from, so a contract that
   * is not the SAC it claims to be is refused rather than mislabelled.
   *
   * Any other failure, such as a contract error from `asset_metadata`, is
   * thrown as {@link ContractCallError}, not masked by the fallback.
   *
   * @param sac The asset's Stellar Asset Contract address (C…).
   * @returns `{ code, issuer, displayName }`; `issuer` is `""` for native XLM.
   * @throws {ContractCallError} when a read fails for a reason other than a missing function.
   * @throws {Error} when the fallback finds a contract that is not a Stellar Asset Contract.
   *
   * @example
   * ```ts
   * const meta = await plimsoll.getAssetMetadata(TESTNET.assets.PUSD!.sac);
   * console.log(`${meta.displayName} (${meta.code}) issued by ${meta.issuer}`);
   * ```
   */
  async getAssetMetadata(sac: string): Promise<AssetMeta> {
    try {
      const v = await this.read(this.ledger, "asset_metadata", [addr(sac)]);
      if (v != null) return decodeAssetMeta(v as Raw);
    } catch (err) {
      if (!isMissingFunctionError(err)) throw err;
    }
    return this.assetMetadataFromSac(sac);
  }

  /** The fallback for {@link getAssetMetadata}: the SAC's own `name()`. */
  private async assetMetadataFromSac(sac: string): Promise<AssetMeta> {
    const name = await this.read(new Contract(sac), "name", []);
    const { code, issuer } = parseSacName(String(name));
    const asset = issuer ? new Asset(code, issuer) : Asset.native();
    if (asset.contractId(this.network.networkPassphrase) !== sac) {
      throw new Error(`${sac} is not the Stellar Asset Contract for ${code}:${issuer || "native"}`);
    }
    return { code, issuer, displayName: code };
  }

  async getReporter(address: string): Promise<ReporterInfo | null> {
    return opt(await this.read(this.registry, "get_reporter", [addr(address)]), decodeReporter);
  }

  async registryAdmin(): Promise<string> {
    return String(await this.read(this.registry, "admin", []));
  }

  async ledgerAdmin(): Promise<string> {
    return String(await this.read(this.ledger, "admin", []));
  /**
   * Dry-run `is_covered` through Soroban simulation without signing or
   * submitting a transaction. Returns the boolean the contract would return,
   * or throws {@link ContractCallError} when the contract rejects the call
   * (e.g. the asset is not listed or a parameter is out of range).
   *
   * @param sac - SAC address of the asset
   * @param minBps - minimum coverage BPS required
   * @param maxAgeSeconds - maximum age for reserve reports and supply snapshots
   * @param minTier - minimum report tier
   *
   * @example
   * ```ts
   * const covered = await contracts.simulateCoverage(
   *   pusdSac,
   *   10_000,
   *   7 * 24 * 3600,
   *   Tier.AuditorSigned,
   * );
   * console.log(covered); // true | false
   * ```
   */
  async simulateCoverage(
    sac: string,
    minBps: number,
    maxAgeSeconds: number,
    minTier: Tier,
  ): Promise<boolean> {
    const v = await this.read(this.ledger, "is_covered", [
      addr(sac),
      u32(minBps),
      u64(maxAgeSeconds),
      u32(minTier),
    ]);
    return v === true;
  }

  // -- writes: return prepared, unsigned transaction XDR --

  /** Dispute the report identified by SAC and its Unix timestamp in seconds. */
  async prepareDisputeReport(
    watcher: string,
    sac: string,
    asOf: number | bigint,
    opts?: PrepareOptions,
  ): Promise<string> {
    return this.prepare(
      watcher,
      this.ledger.call("dispute_report", addr(watcher), addr(sac), u64(asOf)),
      opts,
    );
  }

  /** List a classic asset by SAC address. Anyone may call it. */
  async prepareListAsset(source: string, sac: string, opts?: PrepareOptions): Promise<string> {
    return this.prepare(source, this.ledger.call("list_asset", addr(sac)), opts);
  }

  /** Deploy the SAC for a classic asset (needed once per asset per network). */
  async prepareDeploySac(
    source: string,
    code: string,
    issuer: string,
    opts?: PrepareOptions,
  ): Promise<string> {
    return this.prepare(
      source,
      Operation.createStellarAssetContract({ asset: new Asset(code, issuer) }),
      opts,
    );
  }

  /**
   * Builds the `post_reserve` operation.
   *
   * @param a The reserve report parameters.
   * @returns The `xdr.Operation` for posting reserves.
   */
  postReserveOperation(a: ReservePostArgs): xdr.Operation {
    return this.ledger.call(
      "post_reserve",
      addr(a.reporter),
      addr(a.sac),
      i128(a.amount),
      u64(a.asOf),
      bytes32(a.docHash),
      str(a.docUri),
    );
  }

  /** Post a reserve figure. The reporter must be the transaction source. */
  async preparePostReserve(a: ReservePostArgs, opts?: PrepareOptions): Promise<string> {
    return this.prepare(a.reporter, this.postReserveOperation(a), opts);
  }

  async prepareSetReporter(
    admin: string,
    reporter: string,
    role: Role,
    name: string,
    opts?: PrepareOptions,
  ): Promise<string> {
    assertReporterName(name);
    return this.prepare(
      admin,
      this.registry.call("set_reporter", addr(reporter), u32(role), str(name)),
      opts,
    );
  }

  async prepareRevoke(admin: string, reporter: string, opts?: PrepareOptions): Promise<string> {
    return this.prepare(admin, this.registry.call("revoke", addr(reporter)), opts);
  }

  /** Prepare a dispute_report transaction on the coverage ledger. */
  async prepareDisputeReport(
    disputer: string,
    sac: string,
    tier: Tier,
    opts?: PrepareOptions,
  ): Promise<string> {
    return this.prepare(
      disputer,
      this.ledger.call("dispute_report", addr(disputer), addr(sac), u32(tier)),
      opts,
    );
  }

  /** Submit a signed transaction and wait for it to land. Returns the hash. */
  async submit(signedXdr: string, opts: SubmitOptions = {}): Promise<string> {
    const tx = TransactionBuilder.fromXDR(signedXdr, this.network.networkPassphrase);
    const retries = Math.max(0, opts.retries ?? 3);
    let delay = opts.retryDelayMs ?? 500;
    let sent = await this.server.sendTransaction(tx);
    // TRY_AGAIN_LATER is the RPC asking for a retry: back off, then surface it.
    for (let i = 0; i < retries && sent.status === "TRY_AGAIN_LATER"; i++) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
      sent = await this.server.sendTransaction(tx);
    }
    if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
      throw new ContractCallError(
        "submit",
        `status ${sent.status}`,
        sent.errorResult?.toXDR("base64"),
      );
    }
    const final = await this.server.pollTransaction(sent.hash, { attempts: 30 });
    if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      const resultXdr =
        "resultXdr" in final && final.resultXdr ? final.resultXdr.toXDR("base64") : undefined;
      throw new ContractCallError("submit", `transaction ${sent.hash} ${final.status}`, resultXdr);
    }
    return sent.hash;
  }
}
