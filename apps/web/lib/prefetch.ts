import { useEffect } from "react";
import { config } from "./config";

/** Maximum number of asset detail pages to prefetch. */
export const PREFETCH_LIMIT = 10;

/**
 * Returns the URL for an asset detail page, respecting the configured base
 * path so the hint is correct on GitHub Pages and other sub-path deployments.
 *
 * @example
 * assetDetailHref("CABC…", "/plimsoll-app") // "/plimsoll-app/asset/?sac=CABC…"
 * assetDetailHref("CABC…", "")              // "/asset/?sac=CABC…"
 */
export function assetDetailHref(sac: string, basePath = config.basePath): string {
  const base = basePath.replace(/\/+$/, "");
  return `${base}/asset/?sac=${encodeURIComponent(sac)}`;
}

/**
 * Appends `<link rel="prefetch">` elements to `head` for each SAC address,
 * up to `limit`. Returns the inserted elements so the caller can remove them.
 *
 * Skips any SAC whose hint is already present in the document. Exported for
 * unit testing without a React environment.
 */
export function injectPrefetchLinks(
  sacs: readonly string[],
  head: Pick<Document, "head" | "createElement" | "querySelector">,
  limit = PREFETCH_LIMIT,
): HTMLLinkElement[] {
  const inserted: HTMLLinkElement[] = [];
  for (const sac of sacs.slice(0, limit)) {
    const href = assetDetailHref(sac);
    if (head.querySelector(`link[rel="prefetch"][href="${href}"]`)) continue;
    const link = head.createElement("link") as HTMLLinkElement;
    link.rel = "prefetch";
    link.href = href;
    link.as = "document";
    head.head.appendChild(link);
    inserted.push(link);
  }
  return inserted;
}

/**
 * Injects `<link rel="prefetch">` hints for the detail pages of the first
 * {@link PREFETCH_LIMIT} SAC addresses into `<head>` after the asset list
 * renders. Each hint is added only once and removed when the component
 * unmounts.
 *
 * The effect runs only after the browser has painted, so it has no impact on
 * the initial page load score.
 */
export function usePrefetchAssets(sacs: readonly string[]): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const inserted = injectPrefetchLinks(sacs, document);
    return () => {
      for (const link of inserted) link.parentNode?.removeChild(link);
    };
  // Re-run only when the sac list identity changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sacs.join(",")]);
}
