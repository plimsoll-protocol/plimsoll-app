import { StrKey } from "@stellar/stellar-sdk";

/** A classic asset typed in by the visitor. */
export interface AssetRef {
  code: string;
  issuer: string;
}

export const assetKey = (a: AssetRef) => `${a.code}:${a.issuer}`;

const CODE = /^[a-zA-Z0-9]{1,12}$/;

/** Validate a code and issuer; returns the asset or a message for the form. */
export function validateAsset(
  code: string,
  issuer: string,
): { ok: true; asset: AssetRef } | { ok: false; error: string } {
  const c = code.trim();
  const i = issuer.trim();
  if (!CODE.test(c)) {
    return { ok: false, error: "Asset code is 1 to 12 letters or digits." };
  }
  if (!StrKey.isValidEd25519PublicKey(i)) {
    return { ok: false, error: "Issuer must be a valid Stellar account address (starts with G)." };
  }
  return { ok: true, asset: { code: c, issuer: i } };
}

/** The `asset=CODE-ISSUER` parameters of a query string, validated and de-duplicated. */
export function assetsFromSearch(search: string): AssetRef[] {
  const seen = new Set<string>();
  const out: AssetRef[] = [];
  for (const v of new URLSearchParams(search).getAll("asset")) {
    const at = v.indexOf("-");
    if (at < 0) continue;
    const r = validateAsset(v.slice(0, at), v.slice(at + 1));
    if (r.ok && !seen.has(assetKey(r.asset))) {
      seen.add(assetKey(r.asset));
      out.push(r.asset);
    }
  }
  return out;
}

/** The query string (with leading "?", or "") that reproduces a set of custom assets. */
export function searchFromAssets(assets: AssetRef[]): string {
  const q = new URLSearchParams();
  for (const a of assets) q.append("asset", `${a.code}-${a.issuer}`);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** How long a reading is reused before Horizon is asked again. */
export const CACHE_TTL_MS = 5 * 60_000;

interface Stored<T> {
  at: number;
  value: T;
}

type CacheStore = Pick<Storage, "getItem" | "setItem">;

const PREFIX = "plimsoll:watch:";

/** A fresh cached value, or null. Never throws: storage may be missing or full. */
export function readCache<T>(
  store: CacheStore | null,
  key: string,
  now = Date.now(),
  ttl = CACHE_TTL_MS,
): T | null {
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored<T>;
    if (typeof s.at !== "number" || now - s.at > ttl || now < s.at) return null;
    return s.value;
  } catch {
    return null;
  }
}

export function writeCache<T>(
  store: CacheStore | null,
  key: string,
  value: T,
  now = Date.now(),
): void {
  if (!store) return;
  try {
    store.setItem(PREFIX + key, JSON.stringify({ at: now, value } satisfies Stored<T>));
  } catch {
    // Storage full or disabled: the page works, it just refetches.
  }
}

/** The message shown for a failed Horizon read. */
export function horizonMessage(err: unknown): string {
  const status =
    typeof err === "object" && err !== null && "isProviderFailure" in err
      ? (err as { isProviderFailure: boolean }).isProviderFailure
      : false;
  if (status) {
    return "Horizon is rate limiting or unavailable right now. Wait a minute and reload; readings are cached for a few minutes once they succeed.";
  }
  return `Could not read Horizon: ${err instanceof Error ? err.message : String(err)}`;
}

/** Warning for a typed code that is not among the issuer's assets, or null. */
export function unissuedWarning(code: string, issuerCodes: string[] | null): string | null {
  if (!issuerCodes || !code) return null;
  if (issuerCodes.includes(code)) return null;
  if (issuerCodes.length === 0) {
    return `Horizon shows no assets issued by this account, so ${code} does not exist yet.`;
  }
  return `This issuer has not issued ${code}. Check the spelling and case; a wrong code gives a valid-looking address for an asset that does not exist.`;
}
