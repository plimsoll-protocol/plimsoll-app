import { config } from "./config";

export const SITE_TITLE = "Plimsoll — is it backed?";

export const SITE_DESCRIPTION =
  "Reserve coverage for Stellar-issued assets: circulating supply from the ledger, signed reserve reports on-chain, and an is_covered() check any contract can call.";

/** Routes included in the sitemap. All are static files in the export. */
export const PUBLIC_ROUTES = [
  "/",
  "/about/",
  "/asset/",
  "/asset/history/",
  "/compare/",
  "/integrate/",
  "/list/",
  "/mainnet/",
  "/report/",
  "/reporter/",
  "/reporters/",
  "/settings/",
] as const;

/** Origin used in absolute metadata URLs; override for another deployment. */
export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://plimsoll-protocol.github.io";
  return raw.replace(/\/+$/, "");
}

/** Absolute public URL, including the GitHub Pages base path when configured. */
export function publicUrl(path = "/"): string {
  const base = config.basePath.replace(/\/+$/, "");
  const route = path === "/" ? "/" : `/${path.replace(/^\/+/, "")}`;
  return `${siteOrigin()}${base}${route}`;
}
