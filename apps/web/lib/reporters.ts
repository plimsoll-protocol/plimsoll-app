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

/**
 * Split the registry into one group per role, in a fixed order so the page
 * does not reshuffle between loads. Names are sorted case-insensitively, with
 * the address as a tie-break. A role this build does not know (a newer
 * indexer) is skipped rather than shown without a heading.
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
