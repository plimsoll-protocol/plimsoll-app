import { parse as parseToml } from "smol-toml";
import { parseUnits } from "./format";

/**
 * Circulating supply of a classic asset, by bucket, in smallest units.
 * Same rule as the Plimsoll indexer (internal/horizon): every bucket that is
 * a claim on the issuer is counted.
 */
export interface SupplyBuckets {
  authorized: bigint;
  authorizedToMaintainLiabilities: bigint;
  unauthorized: bigint;
  claimableBalances: bigint;
  liquidityPools: bigint;
  contracts: bigint;
  total: bigint;
}

/** The fields of a Horizon `/assets` record this module reads. */
export interface HorizonAssetRecord {
  asset_code: string;
  asset_issuer: string;
  accounts: { authorized: number };
  balances: {
    authorized: string;
    authorized_to_maintain_liabilities: string;
    unauthorized: string;
  };
  claimable_balances_amount: string;
  liquidity_pools_amount: string;
  contracts_amount: string;
  flags: {
    auth_required: boolean;
    auth_revocable: boolean;
    auth_immutable: boolean;
    auth_clawback_enabled: boolean;
  };
}

const units = (s: string | undefined) => (s ? parseUnits(s) : 0n);

export function supplyFromRecord(r: HorizonAssetRecord): SupplyBuckets {
  const b = {
    authorized: units(r.balances.authorized),
    authorizedToMaintainLiabilities: units(r.balances.authorized_to_maintain_liabilities),
    unauthorized: units(r.balances.unauthorized),
    claimableBalances: units(r.claimable_balances_amount),
    liquidityPools: units(r.liquidity_pools_amount),
    contracts: units(r.contracts_amount),
  };
  const total = Object.values(b).reduce((sum, v) => sum + v, 0n);
  return { ...b, total };
}

/**
 * A Horizon request that returned a status, as opposed to one that never
 * connected. The status matters: 404 means Horizon has no such thing, while
 * 429 or a 5xx means Horizon itself is in trouble and the same request may
 * succeed later.
 */
export class HorizonError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`${url}: ${status}`);
    this.name = "HorizonError";
  }

  /** True when Horizon is rate limiting or failing, rather than answering. */
  get isProviderFailure(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

async function getJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new HorizonError(res.status, url);
  return (await res.json()) as T;
}

/** Fetch an asset's Horizon record. Returns null if Horizon has none. */
export async function fetchAssetRecord(
  horizonUrl: string,
  code: string,
  issuer: string,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): Promise<HorizonAssetRecord | null> {
  const q = new URLSearchParams({ asset_code: code, asset_issuer: issuer });
  const page = await getJson<{ _embedded: { records: HorizonAssetRecord[] } }>(
    `${horizonUrl.replace(/\/+$/, "")}/assets?${q}`,
    fetchImpl,
  );
  return page._embedded.records[0] ?? null;
}

/** The issuer account's home_domain, or "" if unset. */
export async function fetchHomeDomain(
  horizonUrl: string,
  issuer: string,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): Promise<string> {
  const acct = await getJson<{ home_domain?: string }>(
    `${horizonUrl.replace(/\/+$/, "")}/accounts/${issuer}`,
    fetchImpl,
  );
  return acct.home_domain ?? "";
}

export interface TomlCurrency {
  code: string;
  issuer: string;
  name?: string;
  is_asset_anchored?: boolean;
  anchor_asset?: string;
  attestation_of_reserve?: string;
}

export interface TomlCheck {
  /** "confirmed": the toml lists this code and issuer. */
  status: "confirmed" | "not-listed" | "not-found" | "unreachable" | "invalid" | "no-domain";
  orgName?: string;
  currency?: TomlCurrency;
  detail?: string;
}

/** Parse a stellar.toml body and look for code + issuer under [[CURRENCIES]]. */
export function findCurrency(tomlText: string, code: string, issuer: string): TomlCheck {
  let doc: Record<string, unknown>;
  try {
    doc = parseToml(tomlText) as Record<string, unknown>;
  } catch (err) {
    return { status: "invalid", detail: err instanceof Error ? err.message : String(err) };
  }
  const docs = (doc.DOCUMENTATION ?? {}) as { ORG_NAME?: string };
  const currencies = (Array.isArray(doc.CURRENCIES) ? doc.CURRENCIES : []) as TomlCurrency[];
  const match = currencies.find((c) => c.code === code && c.issuer === issuer);
  const base = docs.ORG_NAME ? { orgName: docs.ORG_NAME } : {};
  return match ? { status: "confirmed", ...base, currency: match } : { status: "not-listed", ...base };
}

/**
 * Fetch https://{domain}/.well-known/stellar.toml and check it names this
 * asset. SEP-1 requires the file to allow cross-origin reads, so this works
 * from a browser when the issuer follows the standard.
 */
export async function checkStellarToml(
  domain: string,
  code: string,
  issuer: string,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): Promise<TomlCheck> {
  if (!domain) return { status: "no-domain" };
  let res: Response;
  try {
    res = await fetchImpl(`https://${domain}/.well-known/stellar.toml`);
  } catch (err) {
    return { status: "unreachable", detail: err instanceof Error ? err.message : String(err) };
  }
  if (res.status === 404) return { status: "not-found", detail: "404" };
  if (!res.ok) return { status: "unreachable", detail: String(res.status) };
  return findCurrency(await res.text(), code, issuer);
}
