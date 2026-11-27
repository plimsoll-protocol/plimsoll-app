import type { IndexerReporter } from "@plimsoll/sdk";

/** The three registry roles, in the order they carry weight in a report. */
export type ReporterRole = IndexerReporter["role"];

export const REPORTER_ROLES: readonly ReporterRole[] = ["auditor", "transcriber", "supply_poster"];

export const ROLE_HEADINGS: Record<ReporterRole, string> = {
  auditor: "Auditors",
  transcriber: "Transcribers",
  supply_poster: "Supply posters",
};

export const ROLE_DESCRIPTIONS: Record<ReporterRole, string> = {
  auditor: "Registered auditors can sign a reserve report at the Auditor-signed tier.",
  transcriber: "Transcribers copy a published reserve figure; their reports are Transcribed.",
  supply_poster: "Supply posters post the circulating supply of listed assets.",
};

/** How the directory orders reporters within each role (filter-panel sort). */
export type ReporterSort = "name-asc" | "name-desc" | "recent";

export const REPORTER_SORTS: readonly ReporterSort[] = ["name-asc", "name-desc", "recent"];

export const REPORTER_SORT_LABELS: Record<ReporterSort, string> = {
  "name-asc": "Name (A–Z)",
  "name-desc": "Name (Z–A)",
  recent: "Recently updated",
};

export const DEFAULT_REPORTER_SORT: ReporterSort = "name-asc";

export interface ReporterGroup {
  role: ReporterRole;
  heading: string;
  description: string;
  reporters: IndexerReporter[];
}

/** How the reporter tables are ordered. */
export type SortKey = "name" | "reputation";
export type SortDirection = "asc" | "desc";

export interface Sort {
  key: SortKey;
  direction: SortDirection;
}

/** Default when reputation sorting is chosen: best reputation first. */
export const REPUTATION_TOOLTIP =
  "On-chain reputation score from the reporter registry. Higher means the reporter's past reports have held up; a dash means the registry has not recorded a score for this address.";

/**
 * The registry score as a finite number, or null when the indexer sent
 * nothing usable (a missing column, null or a non-numeric string), so the page
 * can show a dash and keep the row out of the ranked order.
 */
export function reputationOf(reporter: IndexerReporter): number | null {
  // Treat the field as unknown: the indexer is JSON, and a null, a string or
  // a missing column should all read as "no score" rather than a rank.
  const value: unknown = reporter.reputation;
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function byName(a: IndexerReporter, b: IndexerReporter): number {
  return (
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
    a.address.localeCompare(b.address)
  );
}

/**
 * Order one role's reporters. Name sorting is the registry's usual A–Z (or
 * Z–A). Reputation sorting ranks scored reporters first, best first when
 * descending, and always keeps unscored reporters last so a missing score never
 * reads as a bad one. Ties fall back to name, then address.
 */
export function sortReporters(
  list: readonly IndexerReporter[],
  sort: Sort,
): IndexerReporter[] {
  const out = [...list];
  if (sort.key === "name") {
    out.sort((a, b) => (sort.direction === "asc" ? byName(a, b) : byName(b, a)));
    return out;
  }
  out.sort((a, b) => {
    const ra = reputationOf(a);
    const rb = reputationOf(b);
    if (ra === null && rb === null) return byName(a, b);
    if (ra === null) return 1;
    if (rb === null) return -1;
    if (ra !== rb) return sort.direction === "asc" ? ra - rb : rb - ra;
    return byName(a, b);
  });
  return out;
}

export function isReporterRole(value: string): value is ReporterRole {
  return (REPORTER_ROLES as readonly string[]).includes(value);
}

export function isReporterSort(value: string): value is ReporterSort {
  return (REPORTER_SORTS as readonly string[]).includes(value);
}

/**
 * Reporters whose name or address contains the query, case-insensitively.
 * Surrounding whitespace is ignored, and an empty query keeps everyone.
 */
export function filterReporters(
  list: readonly IndexerReporter[],
  query: string,
): IndexerReporter[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...list];
  return list.filter(
    (reporter) =>
      reporter.name.toLowerCase().includes(needle) ||
      reporter.address.toLowerCase().includes(needle),
  );
}

/** The unix second of a reporter's last update, with unparseable values last. */
function updatedEpoch(reporter: IndexerReporter): number | null {
  if (!reporter.updated_at) return null;
  const ms = Date.parse(reporter.updated_at);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

function compareNames(a: IndexerReporter, b: IndexerReporter): number {
  return (
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.address.localeCompare(b.address)
  );
}

export function compareReporters(
  a: IndexerReporter,
  b: IndexerReporter,
  sort: ReporterSort,
): number {
  if (sort === "name-desc") return compareNames(b, a);
  if (sort === "recent") {
    const ae = updatedEpoch(a);
    const be = updatedEpoch(b);
    if (ae !== be) {
      if (ae === null) return 1;
      if (be === null) return -1;
      return be - ae;
    }
  }
  return compareNames(a, b);
}

/**
 * Split the registry into one group per role, in a fixed order so the page
 * does not reshuffle between loads. Reporters are ordered by `sort` within
 * their role. A role this build does not know (a newer indexer) is skipped
 * rather than shown without a heading.
 */
export function groupReporters(
  list: readonly IndexerReporter[],
  sort: Sort = { key: "name", direction: "asc" },
): ReporterGroup[] {
  const groups: ReporterGroup[] = REPORTER_ROLES.map((role) => ({
    role,
    heading: ROLE_HEADINGS[role],
    description: ROLE_DESCRIPTIONS[role],
    reporters: [],
  }));
  for (const reporter of list) {
    if (!isReporterRole(reporter.role)) continue;
    groups.find((g) => g.role === reporter.role)?.reporters.push(reporter);
  }
  for (const group of groups) group.reporters = sortReporters(group.reporters, sort);
  return groups;
}

/**
 * How many filters differ from their default. The search box counts when it
 * has text; the sort counts when it is not the default order.
 */
export function activeFilterCount(query: string, sort: ReporterSort): number {
  return (query.trim() ? 1 : 0) + (sort === DEFAULT_REPORTER_SORT ? 0 : 1);
}

/**
 * The registry timestamp as unix seconds, or null when the indexer sent an
 * empty or unparseable value, so the page can show a dash instead of "Invalid
 * Date".
 */
export function updatedAt(iso: string | undefined): { iso: string; epoch: number } | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return { iso, epoch: Math.floor(ms / 1000) };
}

/** Orderings offered by the reporter directory. The page groups by role, so
 * the sort applies inside a group. */
export type ReporterSort = "name" | "recent";

export const REPORTER_SORTS: readonly ReporterSort[] = ["name", "recent"];

export const SORT_LABELS: Record<ReporterSort, string> = {
  name: "Name (A–Z)",
  recent: "Recently updated",
};

/** The search text and the order chosen in the filter panel. */
export interface ReporterFilter {
  query: string;
  sort: ReporterSort;
}

export const DEFAULT_REPORTER_FILTER: ReporterFilter = { query: "", sort: "name" };

/** Keeps a value read from a `<select>` or storage inside the known sorts. */
export function parseReporterSort(value: string | null | undefined): ReporterSort {
  return (REPORTER_SORTS as readonly string[]).includes(value ?? "")
    ? (value as ReporterSort)
    : DEFAULT_REPORTER_FILTER.sort;
}

/**
 * How many of the panel's controls are narrowing the list. The badge on the
 * collapsed header uses this; a sort that is not the default counts too,
 * because it changes what the reader sees.
 */
export function activeFilterCount(filter: ReporterFilter): number {
  return (filter.query.trim() ? 1 : 0) + (filter.sort !== DEFAULT_REPORTER_FILTER.sort ? 1 : 0);
}

/** True when a reporter's name, address or role heading contains the query. */
export function matchesReporterQuery(
  reporter: IndexerReporter,
  query: string,
  headings: Partial<Record<string, string>> = ROLE_HEADINGS,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [reporter.name, reporter.address, headings[reporter.role] ?? reporter.role].some((value) =>
    value.toLowerCase().includes(q),
  );
}

const byName = (a: IndexerReporter, b: IndexerReporter) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.address.localeCompare(b.address);

/** Unix seconds for sorting, with an unparseable date pushed to the end. */
const updatedEpoch = (reporter: IndexerReporter): number => {
  const at = updatedAt(reporter.updated_at);
  return at ? at.epoch : Number.NEGATIVE_INFINITY;
};

/** Apply the panel's search and sort without changing the input list. */
export function filterReporters(
  list: readonly IndexerReporter[],
  filter: ReporterFilter,
): IndexerReporter[] {
  const out = list.filter((reporter) => matchesReporterQuery(reporter, filter.query));
  out.sort((a, b) =>
    filter.sort === "recent" ? updatedEpoch(b) - updatedEpoch(a) || byName(a, b) : byName(a, b),
  );
  return out;
}

/** localStorage key for whether the filter panel is expanded. */
export const FILTER_PANEL_STORAGE_KEY = "plimsoll:reporters:filter-panel";

/** The slice of localStorage this module needs, so tests can pass a fake. */
export type FilterPanelStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * The saved panel state, or null when none has been saved (first visit) or
 * storage is unavailable or corrupt. Null means "use the viewport default".
 */
export function readFilterPanelOpen(
  storage: FilterPanelStorage | null | undefined,
): boolean | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(FILTER_PANEL_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

/** Persist the panel state; storage being full or blocked is not an error. */
export function writeFilterPanelOpen(
  storage: FilterPanelStorage | null | undefined,
  open: boolean,
): void {
  if (!storage) return;
  try {
    storage.setItem(FILTER_PANEL_STORAGE_KEY, open ? "true" : "false");
  } catch {
    // A blocked or full localStorage must not stop the panel working.
  }
}

/** First-visit default: open on desktop, closed on narrow screens. */
export function defaultFilterPanelOpen(desktop: boolean): boolean {
  return desktop;
}
