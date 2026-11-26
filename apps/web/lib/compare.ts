import { StrKey } from "@stellar/stellar-sdk";

/** The most assets a single comparison can show. */
export const MAX_COMPARE = 5;

/** Dashboard query parameter that holds the selection, comma separated. */
export const COMPARE_PARAM = "compare";

/** Comparison page query parameter, also comma separated. */
export const COMPARE_PAGE_PARAM = "sac";

/**
 * Series colours are CSS variables so the same index stays distinguishable in
 * light and dark mode. Each value is a separate hue rather than a tint of one.
 */
export const SERIES_COLORS = [
  "--series-1",
  "--series-2",
  "--series-3",
  "--series-4",
  "--series-5",
] as const;

/** The CSS colour for series `index`, wrapping after the last defined hue. */
export function seriesColor(index: number): string {
  return `var(${SERIES_COLORS[index % SERIES_COLORS.length] ?? SERIES_COLORS[0]})`;
}

/**
 * Reads a selection from `params`. Values may be repeated or comma separated;
 * invalid or duplicate contract ids are dropped and the list is capped at
 * MAX_COMPARE so hand-edited URLs cannot overflow the chart.
 */
export function parseSelection(params: URLSearchParams, key: string = COMPARE_PARAM): string[] {
  const parts = params.getAll(key).flatMap((value) => value.split(","));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const sac = part.trim();
    if (!sac || seen.has(sac) || !StrKey.isValidContract(sac)) continue;
    seen.add(sac);
    out.push(sac);
    if (out.length === MAX_COMPARE) break;
  }
  return out;
}

/** Adds or removes `sac`, refusing to grow past MAX_COMPARE. */
export function toggleSelection(selected: readonly string[], sac: string): string[] {
  if (selected.includes(sac)) return selected.filter((s) => s !== sac);
  if (selected.length >= MAX_COMPARE) return [...selected];
  return [...selected, sac];
}

/** The dashboard's query string for a selection, empty when nothing is picked. */
export function selectionSearch(selected: readonly string[]): string {
  return selected.length === 0 ? "" : `?${COMPARE_PARAM}=${selected.join(",")}`;
}

/** The comparison page URL for a selection. */
export function comparisonHref(selected: readonly string[]): string {
  return `/compare/?${COMPARE_PAGE_PARAM}=${selected.map(encodeURIComponent).join(",")}`;
}
