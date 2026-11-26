/** Weight of a reserve report. Higher is stronger. Mirrors plimsoll_types::Tier. */
export enum Tier {
  Transcribed = 1,
  IssuerSigned = 2,
  AuditorSigned = 3,
}

/** What a registered address may post. Mirrors plimsoll_types::Role. */
export enum Role {
  Auditor = 1,
  Transcriber = 2,
  SupplyPoster = 3,
  Watcher = 4,
}

export interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  coverageLedgerId: string;
  reporterRegistryId: string;
  horizonUrl?: string;
}

export interface AssetRecord {
  sac: string;
  code: string;
  issuer: string;
  listedAt: number;
}

/**
 * How an asset is named for display. Returned by
 * {@link PlimsollContracts.getAssetMetadata}.
 */
export interface AssetMeta {
  /** Asset code, e.g. `"USDC"`. `"XLM"` for the native asset. */
  code: string;
  /** Issuer account (G…). Empty string for the native asset, which has no issuer. */
  issuer: string;
  /**
   * Human-readable name. The coverage ledger's `asset_metadata` value when the
   * contract provides one; otherwise the asset code.
   */
  displayName: string;
}

export interface SupplySnapshot {
  /** Smallest units (7 decimals for classic assets). */
  amount: bigint;
  ledger: number;
  timestamp: number;
  breakdownHash: string;
  poster: string;
}

export interface ReserveReport {
  amount: bigint;
  asOf: number;
  postedAt: number;
  tier: Tier;
  reporter: string;
  docHash: string;
  docUri: string;
}

export interface Coverage {
  /** 10_000 = 100%. 4_294_967_295 means nothing is owed. */
  bps: number;
  supply: bigint;
  reserves: bigint;
  tier: Tier;
  supplyLedger: number;
  supplyTimestamp: number;
  reportAsOf: number;
}

export interface ReporterInfo {
  role: Role;
  name: string;
  addedAt: number;
}

/**
 * A single entry in a vault's withdrawal queue.
 *
 * @remarks
 * Returned by {@link CoveredVaultClient.getPendingWithdrawals}. The queue is
 * ordered oldest-first by the vault contract; entries are removed when the
 * withdrawal is processed or cancelled.
 */
export interface WithdrawalRequest {
  /** Stellar address of the account that queued the withdrawal. */
  to: string;
  /** Amount requested, in smallest units (7 decimal places for classic assets). */
  amount: bigint;
  /** Ledger sequence number at which the request was submitted. */
  submittedAt: number;
}

/** bps value the contract returns when supply is zero. */
export const NOTHING_OWED_BPS = 4_294_967_295;
