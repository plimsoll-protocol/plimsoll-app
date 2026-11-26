import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { Buffer } from "buffer";
import { RegistryError, describeError, parseContractErrorCode } from "./errors";
import type {
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

  async getReporter(address: string): Promise<ReporterInfo | null> {
    return opt(await this.read(this.registry, "get_reporter", [addr(address)]), decodeReporter);
  }

  async registryAdmin(): Promise<string> {
    return String(await this.read(this.registry, "admin", []));
  }

  async ledgerAdmin(): Promise<string> {
    return String(await this.read(this.ledger, "admin", []));
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

  /** Post a reserve figure. The reporter must be the transaction source. */
  async preparePostReserve(a: ReservePostArgs, opts?: PrepareOptions): Promise<string> {
    return this.prepare(
      a.reporter,
      this.ledger.call(
        "post_reserve",
        addr(a.reporter),
        addr(a.sac),
        i128(a.amount),
        u64(a.asOf),
        bytes32(a.docHash),
        str(a.docUri),
      ),
      opts,
    );
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
