import { loadAssets, loadReporters } from "./data";
import { assetEntries, reporterEntries, type SearchEntry } from "./search";

export type SearchSource = "assets" | "reporters";

export interface SearchData {
  /** Assets and reporters that could be read. Pages and docs are static and not included. */
  entries: SearchEntry[];
  /** Sources that were asked for and failed, so the overlay can say results may be missing. */
  failed: SearchSource[];
}

async function fetchSearchData(): Promise<SearchData> {
  // Independent reads: a slow or failing reporter list must not hide the assets.
  const [assets, reporters] = await Promise.allSettled([loadAssets(), loadReporters()]);
  const entries: SearchEntry[] = [];
  const failed: SearchSource[] = [];

  if (assets.status === "fulfilled") entries.push(...assetEntries(assets.value));
  else failed.push("assets");

  // null means no indexer is configured: nothing to list, and not a failure.
  if (reporters.status === "fulfilled") entries.push(...reporterEntries(reporters.value ?? []));
  else failed.push("reporters");

  return { entries, failed };
}

let cached: Promise<SearchData> | null = null;

/**
 * Read the searchable assets and reporters once per page load, the first time
 * the overlay opens. A result with failures is not kept, so reopening the
 * overlay tries the failed source again.
 */
export function loadSearchData(): Promise<SearchData> {
  if (!cached) {
    const pending = fetchSearchData();
    cached = pending;
    void pending.then((data) => {
      if (data.failed.length > 0 && cached === pending) cached = null;
    });
  }
  return cached;
}

/** Forget what was read. For tests. */
export function resetSearchData(): void {
  cached = null;
}
