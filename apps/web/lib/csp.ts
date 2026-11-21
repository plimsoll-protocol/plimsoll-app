/**
 * Content-Security-Policy for the static export.
 *
 * GitHub Pages cannot set response headers, so the policy is delivered in a
 * <meta http-equiv> tag (see app/layout.tsx). Next's static export inlines
 * small bootstrap scripts into every page. Their hashes are only known after
 * the build, so the layout writes SCRIPT_HASHES_TOKEN and
 * scripts/apply-csp.mjs replaces it with the sha256 of each inline script in
 * that page. No 'unsafe-inline' for scripts.
 */
export const SCRIPT_HASHES_TOKEN = "__INLINE_SCRIPT_HASHES__";

export interface CspInput {
  /** Every URL the app is configured to call: RPC, Horizon, indexer, mainnet Horizon. */
  endpoints: string[];
}

/** The origin of a URL, or null when it is empty or not a URL ("none", ""). */
export function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp({ endpoints }: CspInput): string {
  const origins = [...new Set(endpoints.map(originOf).filter((o): o is string => o !== null))];
  const directives: [string, string[]][] = [
    ["default-src", ["'none'"]],
    ["script-src", ["'self'", SCRIPT_HASHES_TOKEN]],
    ["style-src", ["'self'"]],
    // React style={{}} props become style attributes. These cannot run script;
    // inline <style> elements stay blocked by style-src.
    ["style-src-attr", ["'unsafe-inline'"]],
    ["img-src", ["'self'", "data:"]],
    ["font-src", ["'self'"]],
    // The configured services, plus https: because the app fetches issuer
    // stellar.toml files and reserve documents from arbitrary hosts.
    ["connect-src", ["'self'", ...origins, "https:"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}
