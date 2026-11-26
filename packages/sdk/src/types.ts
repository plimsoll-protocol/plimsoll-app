export {
  Tier,
  Role,
  type AssetRecord,
  type SupplySnapshot,
  type ReserveReport,
  type Coverage,
  type ReporterInfo,
  type WithdrawalRequest,
  type CoverageLedgerFns,
  type ReporterRegistryFns,
  type CoveredVaultFns,
  type PlimsollContractFns,
} from "./generated/contract-types";

export interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  coverageLedgerId: string;
  reporterRegistryId: string;
  horizonUrl?: string;
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

/** bps value the contract returns when supply is zero. */
export const NOTHING_OWED_BPS = 4_294_967_295;
