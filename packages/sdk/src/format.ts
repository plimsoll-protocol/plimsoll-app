import { NOTHING_OWED_BPS, Role, Tier } from "./types";

export const CLASSIC_DECIMALS = 7;

/**
 * Format an integer amount of smallest units as a decimal string with
 * thousands separators. Rounds down to `maxFractionDigits`.
 */
export function formatUnits(
  amount: bigint,
  decimals = CLASSIC_DECIMALS,
  maxFractionDigits = 2,
): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  let fracStr = frac.toString().padStart(decimals, "0").slice(0, maxFractionDigits);
  fracStr = fracStr.replace(/0+$/, "");
  const sign = negative ? "-" : "";
  return fracStr ? `${sign}${wholeStr}.${fracStr}` : `${sign}${wholeStr}`;
}

/** Parse a decimal string ("1,020,000.5") into smallest units. */
export function parseUnits(value: string, decimals = CLASSIC_DECIMALS): bigint {
  const clean = value.replace(/[,\s_]/g, "");
  if (!/^\d+(\.\d+)?$/.test(clean)) {
    throw new Error(`Not a non-negative decimal number: "${value}"`);
  }
  const [whole = "0", frac = ""] = clean.split(".");
  if (frac.length > decimals) {
    throw new Error(`At most ${decimals} decimal places`);
  }
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

/** 10200 → "102.00%". Returns null when nothing is owed. */
export function bpsToPercent(bps: number): string | null {
  if (bps === NOTHING_OWED_BPS) return null;
  return `${(bps / 100).toFixed(2)}%`;
}

export type CoverageStatus = "covered" | "under" | "stale" | "unknown";

/**
 * The freshness window assumed when a caller names none.
 *
 * There is no canonical window in the protocol: `is_covered` takes `max_age`
 * from whoever is asking, and the demo's PUSD vault asks for 7 days. Pass the
 * window your own consumer uses; the default is the stricter of the demo's two
 * vaults, because a reading shown as backed when the contract would refuse it
 * is the one wrong answer worth avoiding.
 */
export const DEFAULT_MAX_AGE_SECONDS = 7 * 24 * 3600;

/** How old the two halves of a coverage reading are, in seconds. */
export interface CoverageAges {
  /** The reserve report the ratio was computed against. */
  report: number | null | undefined;
  /**
   * The supply snapshot it was divided by. Optional only because a caller may
   * not have it; when it is known, pass it — `is_covered` requires both halves
   * to be fresh and returns false if either has expired.
   */
  supply?: number | null;
}

/**
 * Classify a coverage reading for display, the way `is_covered` would judge it.
 *
 * Both ages matter. Showing a ratio as backed while the contract refuses it is
 * how the testnet demo misled for sixteen days: the page compared only the
 * report's age against a 31-day window, so a report that had expired against
 * the vault's 7-day window still read "Fully backed", and during an earlier
 * ingestion outage a nine-day-old supply snapshot did too.
 */
export function coverageStatus(
  bps: number | null | undefined,
  ages: CoverageAges,
  maxAgeSeconds: number = DEFAULT_MAX_AGE_SECONDS,
): CoverageStatus {
  if (bps == null || ages.report == null) return "unknown";
  if (ages.report > maxAgeSeconds) return "stale";
  if (ages.supply != null && ages.supply > maxAgeSeconds) return "stale";
  return bps >= 10_000 ? "covered" : "under";
}

export function tierLabel(tier: Tier): string {
  switch (tier) {
    case Tier.AuditorSigned:
      return "Auditor-signed";
    case Tier.IssuerSigned:
      return "Issuer-signed";
    case Tier.Transcribed:
      return "Transcribed";
    default:
      return "Unknown";
  }
}

/** Indexer tier names → enum. */
export function tierFromName(name: string): Tier | undefined {
  switch (name) {
    case "auditor_signed":
      return Tier.AuditorSigned;
    case "issuer_signed":
      return Tier.IssuerSigned;
    case "transcribed":
      return Tier.Transcribed;
    default:
      return undefined;
  }
}

export function roleLabel(role: Role): string {
  switch (role) {
    case Role.Auditor:
      return "Auditor";
    case Role.Transcriber:
      return "Transcriber";
    case Role.SupplyPoster:
      return "Supply poster";
    default:
      return "Unknown";
  }
}

/** "GABC…WXYZ" */
export function shortAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

/** "3 hours ago", "2 days ago". */
export function ago(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const units: [number, string][] = [
    [86_400, "day"],
    [3_600, "hour"],
    [60, "minute"],
  ];
  for (const [size, name] of units) {
    if (s >= size) {
      const n = Math.floor(s / size);
      return `${n} ${name}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}
