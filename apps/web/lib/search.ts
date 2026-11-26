import { shortAddress, type IndexerReporter } from "@plimsoll/sdk";

/**
 * The pure half of the CMD/CTRL+K search overlay: what can be searched, how a
 * query ranks it, and the keyboard rules. The overlay itself (components/
 * SearchPalette.tsx) only wires these to the DOM, so everything that can go
 * wrong with matching or navigation is tested here without a browser.
 */

export type SearchKind = "asset" | "reporter" | "page" | "doc";

export interface SearchEntry {
  /** Stable and unique across kinds, used as the React key and the option id. */
  id: string;
  kind: SearchKind;
  title: string;
  /** One line under the title: what this result is. */
  detail: string;
  /** A route inside the app, or an absolute URL when `external` is true. */
  href: string;
  external: boolean;
  /** Extra text that should find this entry but is not shown as its title. */
  terms: string[];
}

/** Delay between the last keystroke and the search running. */
export const SEARCH_DEBOUNCE_MS = 150;

/** Results shown at once. A longer list is not a better answer. */
export const MAX_RESULTS = 20;

export const KIND_LABELS: Record<SearchKind, string> = {
  asset: "Asset",
  reporter: "Reporter",
  page: "Page",
  doc: "Docs",
};

const KIND_ORDER: Record<SearchKind, number> = { asset: 0, reporter: 1, page: 2, doc: 3 };

export const DOCS_BASE_URL = "https://plimsoll-protocol.gitbook.io/plimsoll-protocol-docs";

const page = (path: string, title: string, detail: string, terms: string[] = []): SearchEntry => ({
  id: `page:${path}`,
  kind: "page",
  title,
  detail,
  href: path,
  external: false,
  terms,
});

/** The app's own routes. Keep in step with the navigation in SiteChrome. */
export const PAGE_ENTRIES: readonly SearchEntry[] = [
  page("/", "Assets", "Every listed asset and its coverage", ["home", "coverage", "backed"]),
  page("/reporters/", "Reporters", "Auditors, transcribers and supply posters", [
    "registry",
    "auditor",
    "transcriber",
  ]),
  page("/mainnet/", "Mainnet watch", "Reserve figures for mainnet assets", ["mainnet", "watch"]),
  page("/report/", "Post a report", "Sign and submit a reserve report", ["reserve", "submit"]),
  page("/list/", "List an asset", "Add an asset to the coverage ledger", ["listing", "add"]),
  page("/integrate/", "Integrate", "Call is_covered() from your contract", ["developers", "sdk"]),
  page("/about/", "How it works", "Tiers, reporters and the coverage ratio", [
    "tiers",
    "basis points",
  ]),
  page("/settings/", "Alert settings", "Webhooks and notifications when coverage drops", [
    "alerts",
    "webhook",
    "notifications",
  ]),
];

const doc = (path: string, title: string, section: string): SearchEntry => ({
  id: `doc:${path}`,
  kind: "doc",
  title,
  detail: `Docs · ${section}`,
  href: path === "" ? DOCS_BASE_URL : `${DOCS_BASE_URL}/${path}`,
  external: true,
  terms: [section],
});

/** The documentation pages, in the order of docs/SUMMARY.md. */
export const DOC_ENTRIES: readonly SearchEntry[] = [
  doc("", "Introduction", "Start"),
  doc("walkthrough", "Reviewer walkthrough", "Start"),
  doc("protocol/how-it-works", "How it works", "Protocol"),
  doc("protocol/lifecycle", "Lifecycle of a reading", "Protocol"),
  doc("protocol/coverage-math", "Coverage math, worked", "Protocol"),
  doc("protocol/trust-model", "Trust model", "Protocol"),
  doc("contracts/overview", "Overview and addresses", "Smart contracts"),
  doc("contracts/reporter-registry", "reporter-registry", "Smart contracts"),
  doc("contracts/coverage-ledger", "coverage-ledger", "Smart contracts"),
  doc("contracts/covered-vault", "covered-vault", "Smart contracts"),
  doc("guides/holders", "For holders and wallets", "Guides"),
  doc("guides/issuers", "For issuers", "Guides"),
  doc("guides/auditors-and-transcribers", "For auditors and transcribers", "Guides"),
  doc("guides/integrators", "For protocol integrators", "Guides"),
  doc("guides/mainnet-watch", "Mainnet watch", "Guides"),
  doc("developers/local-setup", "Local setup", "Developers"),
  doc("developers/environment", "Environment variables", "Developers"),
  doc("developers/sdk", "TypeScript SDK", "Developers"),
  doc("developers/indexer-api", "Indexer API", "Developers"),
  doc("developers/deploying", "Deploying", "Developers"),
];

const ROLE_LABELS: Record<string, string> = {
  auditor: "Auditor",
  transcriber: "Transcriber",
  supply_poster: "Supply poster",
};

/** The slice of an asset the search needs, so it works for either data source. */
export interface SearchableAsset {
  sac: string;
  code: string;
  issuer: string;
}

export function assetEntries(assets: readonly SearchableAsset[]): SearchEntry[] {
  return assets.map((asset) => ({
    id: `asset:${asset.sac}`,
    kind: "asset",
    title: asset.code,
    detail: `Asset · issuer ${shortAddress(asset.issuer)}`,
    href: `/asset/?sac=${encodeURIComponent(asset.sac)}`,
    external: false,
    terms: [asset.sac, asset.issuer],
  }));
}

export function reporterEntries(reporters: readonly IndexerReporter[]): SearchEntry[] {
  return reporters.map((reporter) => ({
    id: `reporter:${reporter.address}`,
    kind: "reporter",
    title: reporter.name,
    detail: `${ROLE_LABELS[reporter.role] ?? "Reporter"} · ${shortAddress(reporter.address)}`,
    href: "/reporters/",
    external: false,
    terms: [reporter.address, reporter.role.replace(/_/g, " ")],
  }));
}

/** Lower-case, accents folded, whitespace trimmed: how both sides of a match are compared. */
export function normalize(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

function tokensOf(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

/** How well one token matches one entry; 0 means it does not match at all. */
function scoreToken(entry: SearchEntry, token: string): number {
  const title = normalize(entry.title);
  if (title === token) return 120;
  if (title.startsWith(token)) return 100;
  if (title.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(token))) return 80;
  if (title.includes(token)) return 60;

  const terms = entry.terms.map(normalize);
  if (terms.some((term) => term.startsWith(token))) return 50;
  if (terms.some((term) => term.includes(token))) return 30;
  if (normalize(entry.detail).includes(token)) return 10;
  return 0;
}

/**
 * Entries that match every word of the query, best first. With nothing typed
 * it returns the app's own pages, so the overlay is useful the moment it opens.
 * The input is not modified.
 */
export function searchEntries(
  entries: readonly SearchEntry[],
  query: string,
  limit: number = MAX_RESULTS,
): SearchEntry[] {
  const tokens = tokensOf(query);
  if (tokens.length === 0) {
    return entries.filter((entry) => entry.kind === "page").slice(0, limit);
  }

  const scored: Array<{ entry: SearchEntry; score: number }> = [];
  for (const entry of entries) {
    let score = 0;
    let matchedAll = true;
    for (const token of tokens) {
      const s = scoreToken(entry, token);
      if (s === 0) {
        matchedAll = false;
        break;
      }
      score += s;
    }
    if (matchedAll) scored.push({ entry, score });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind] ||
      a.entry.title.localeCompare(b.entry.title) ||
      a.entry.id.localeCompare(b.entry.id),
  );
  return scored.slice(0, limit).map((s) => s.entry);
}

/** The parts of a keyboard event the shortcut check needs. */
export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** CMD+K on macOS, CTRL+K elsewhere; either is accepted on any platform. */
export function isSearchShortcut(e: KeyLike): boolean {
  return e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
}

/**
 * The highlighted row after a navigation key, or null when the key is not one
 * the list handles. Arrows wrap around; with no rows there is nothing to
 * highlight.
 */
export function nextActiveIndex(current: number, count: number, key: string): number | null {
  const handled = key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End";
  if (!handled) return null;
  if (count <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return current >= count - 1 ? 0 : current + 1;
  return current <= 0 ? count - 1 : current - 1;
}

export interface Debouncer<T> {
  /** Run `fn` with `value` after the delay, replacing any call still waiting. */
  call(value: T): void;
  /** Drop a call that is still waiting. */
  cancel(): void;
}

export function createDebouncer<T>(fn: (value: T) => void, delayMs: number): Debouncer<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    call(value) {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        fn(value);
      }, delayMs);
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
