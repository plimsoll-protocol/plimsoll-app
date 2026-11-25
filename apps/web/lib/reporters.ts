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

export type ReporterSort = "name" | "reputation";
export type SortDirection = "asc" | "desc";

/** What the Reputation column header tells a reader it is. */
export const REPUTATION_TOOLTIP =
  "Reputation score published in the reporter registry. Higher means a stronger track record; a dash means no score is available for that reporter.";

/**
 * A usable reputation score, or null when the indexer omitted one or sent
 * something that is not a finite number. A missing score is unknown, not zero.
 */
export function reputationOf(reporter: IndexerReporter): number | null {
  const value = reporter.reputation;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The score as shown in the table, or an em dash when it is unavailable. */
export function reputationText(reporter: IndexerReporter): string {
  const value = reputationOf(reporter);
  return value === null ? "—" : String(value);
}

/**
 * Order a role's reporters by the chosen column. Name order is the registry's
 * default. Reputation puts the highest score first when descending; reporters
 * with no score are always last, in either direction, because unknown is not
 * the same as low. Ties fall back to name, then address, so a table does not
 * reshuffle between identical loads.
 */
export function sortReporters(
  list: readonly IndexerReporter[],
  sort: ReporterSort,
  direction: SortDirection,
): IndexerReporter[] {
  const byName = (a: IndexerReporter, b: IndexerReporter) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
    a.address.localeCompare(b.address);
  const sign = direction === "asc" ? 1 : -1;

  return [...list].sort((a, b) => {
    if (sort === "reputation") {
      const scoreA = reputationOf(a);
      const scoreB = reputationOf(b);
      if (scoreA === null && scoreB === null) return byName(a, b);
      if (scoreA === null) return 1;
      if (scoreB === null) return -1;
      if (scoreA !== scoreB) return (scoreA - scoreB) * sign;
      return byName(a, b);
    }
    return sign * byName(a, b);
  });
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
export function groupReporters(list: readonly IndexerReporter[]): ReporterGroup[] {
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
  for (const group of groups) {
    group.reporters = sortReporters(group.reporters, "name", "asc");
  }
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
