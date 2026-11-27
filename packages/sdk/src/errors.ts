/** Errors of the coverage-ledger contract. Mirrors plimsoll_types::LedgerError. */
export enum LedgerError {
  NotAStellarAsset = 1,
  AlreadyListed = 2,
  AssetNotListed = 3,
  NotSupplyPoster = 4,
  NotReporter = 5,
  InvalidAmount = 6,
  FutureLedger = 7,
  StaleLedger = 8,
  FutureTimestamp = 9,
  StaleReport = 10,
  InvalidUri = 11,
  ImplausibleAmount = 12,
  TooManyReporters = 13,
}

/** Errors of the reporter-registry contract. */
export enum RegistryError {
  ReporterNotFound = 1,
  InvalidName = 2,
}

/** Errors of the covered-vault contract. */
export enum VaultError {
  InvalidAmount = 1,
  NotCovered = 2,
  InsufficientBalance = 3,
}

export type ContractName = "ledger" | "registry" | "vault";

/**
 * Unified namespace for all Plimsoll contract error enums.
 *
 * Each property groups the error codes for one contract:
 * - `PlimsollError.Ledger`   — coverage-ledger contract (`LedgerError`)
 * - `PlimsollError.Registry` — reporter-registry contract (`RegistryError`)
 * - `PlimsollError.Vault`    — covered-vault contract (`VaultError`)
 *
 * The numeric values match the Rust contract error enums and are append-only.
 *
 * @example
 * ```ts
 * import { PlimsollError } from "@plimsoll/sdk";
 * if (code === PlimsollError.Ledger.AssetNotListed) { … }
 * ```
 */
export const PlimsollError = {
  Ledger: LedgerError,
  Registry: RegistryError,
  Vault: VaultError,
} as const;

const MESSAGES: Record<ContractName, Record<number, string>> = {
  ledger: {
    [LedgerError.NotAStellarAsset]: "That address is not a Stellar Asset Contract.",
    [LedgerError.AlreadyListed]: "This asset is already listed.",
    [LedgerError.AssetNotListed]: "This asset is not listed on the coverage ledger.",
    [LedgerError.NotSupplyPoster]: "This account is not a registered supply poster.",
    [LedgerError.NotReporter]:
      "This account is not the issuer and is not a registered auditor or transcriber.",
    [LedgerError.InvalidAmount]: "Reserves cannot be negative.",
    [LedgerError.FutureLedger]: "The supply ledger is in the future.",
    [LedgerError.StaleLedger]: "The supply ledger is not newer than the stored one.",
    [LedgerError.FutureTimestamp]: "The as-of date is in the future.",
    [LedgerError.StaleReport]:
      "There is already a report at this tier with the same or a later as-of date.",
    [LedgerError.InvalidUri]: "The document URL is empty or longer than 256 characters.",
    [LedgerError.ImplausibleAmount]:
      "The amount is outside 0.01% to 10,000% of the current supply and is likely a unit mistake (entering whole units instead of smallest units, or vice versa).",
    [LedgerError.TooManyReporters]:
      "This asset already has the maximum of 4 active reporters at this tier.",
  },
  registry: {
    [RegistryError.ReporterNotFound]: "That address is not a registered reporter.",
    [RegistryError.InvalidName]: "The name is empty or longer than 64 bytes.",
  },
  vault: {
    [VaultError.InvalidAmount]: "The amount must be greater than zero.",
    [VaultError.NotCovered]: "The asset is not covered well enough for this vault.",
    [VaultError.InsufficientBalance]: "The balance is lower than the amount requested.",
  },
};

/** Default human-readable message for a contract error code, or undefined if unknown. */
export function describeError(code: number, contract: ContractName = "ledger"): string | undefined {
  return MESSAGES[contract][code];
}

/** Extracts N from `Error(Contract, #N)` in a simulation or submission failure. */
export function parseContractErrorCode(text: string): number | undefined {
  const m = /Error\(Contract, #(\d+)\)/.exec(text);
  return m && m[1] ? Number(m[1]) : undefined;
}
