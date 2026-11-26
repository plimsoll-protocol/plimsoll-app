import { Contract } from "@stellar/stellar-sdk";
import { ContractClient, addr, big, i128, num, opt, type Raw } from "./contract";
import type { NetworkConfig, Tier, WithdrawalRequest } from "./types";

/** The vault's fixed coverage requirement. */
export interface VaultConfig {
  /** Coverage-ledger contract the vault consults. */
  ledger: string;
  /** SAC address of the asset the vault holds. */
  asset: string;
  minBps: number;
  /** Seconds. */
  maxAge: number;
  minTier: Tier;
}

export function decodeVaultConfig(raw: Raw): VaultConfig {
  return {
    ledger: String(raw.ledger),
    asset: String(raw.asset),
    minBps: num(raw.min_bps),
    maxAge: num(raw.max_age),
    minTier: num(raw.min_tier) as Tier,
  };
}

export function decodeWithdrawalRequest(raw: Raw): WithdrawalRequest {
  return {
    to: String(raw.to),
    amount: big(raw.amount),
    submittedAt: num(raw.submitted_at),
  };
}

/**
 * Client for the reference covered vault. Deposits are refused while the asset
 * is not covered; withdrawals are never blocked. Writes return unsigned XDR.
 */
export class CoveredVaultClient extends ContractClient {
  readonly vault: Contract;

  constructor(config: NetworkConfig, vaultId: string) {
    super(config);
    this.vault = new Contract(vaultId);
  }

  async config(): Promise<VaultConfig | null> {
    return opt(await this.read(this.vault, "config", []), decodeVaultConfig);
  }

  /** Smallest units. */
  async balance(address: string): Promise<bigint> {
    const v = await this.read(this.vault, "balance", [addr(address)]);
    return v == null ? 0n : big(v);
  }

  /** Amount in smallest units, greater than zero. */
  async prepareDeposit(from: string, amount: bigint): Promise<string> {
    return this.prepare(from, this.vault.call("deposit", addr(from), i128(amount)));
  }

  async prepareWithdraw(to: string, amount: bigint): Promise<string> {
    return this.prepare(to, this.vault.call("withdraw", addr(to), i128(amount)));
  }

  /**
   * Returns all entries currently in the vault's withdrawal queue, ordered
   * oldest-first as the contract stores them.
   *
   * @param vaultAddress - The contract ID of the vault to query. Must be the
   *   same vault this client was constructed for, or any vault that exposes
   *   the same `get_withdrawal_queue` view function.
   * @returns An array of pending {@link WithdrawalRequest} objects, or an
   *   empty array when the queue is empty.
   *
   * @example
   * ```ts
   * const queue = await vaultClient.getPendingWithdrawals(VAULT_ID);
   * console.log(`${queue.length} withdrawal(s) pending`);
   * ```
   */
  async getPendingWithdrawals(vaultAddress: string): Promise<WithdrawalRequest[]> {
    const vault = new Contract(vaultAddress);
    const v = await this.read(vault, "get_withdrawal_queue", []);
    if (!Array.isArray(v)) return [];
    return v.map((r) => decodeWithdrawalRequest(r as Raw));
  }
}
