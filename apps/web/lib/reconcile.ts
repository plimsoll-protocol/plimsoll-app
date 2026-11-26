import { ago, type IndexerReconcileAsset, type IndexerReconcileStatus } from "@plimsoll/sdk";

/**
 * Where the indexer documents its state reconciler, linked from the collapsible
 * section on the asset page so a reader can find out what a reconciler does.
 */
export const RECONCILE_DOCS =
  "https://github.com/plimsoll-protocol/plimsoll-indexer/blob/main/docs/runbook.md";

/** What the asset page says about the reconciler for one asset. */
export interface ReconcileSummary {
  /** Either "Reconciled N minutes ago" or "Reconciler not running". */
  headline: string;
  /** Why, in one sentence, for the reader who opens the section. */
  detail: string;
  /** Whether the job counts as running: a stale or switched-off job does not. */
  running: boolean;
}

/** A run older than this many intervals means the job has stopped. */
const STALE_INTERVALS = 3;

/** The fallback interval used when the indexer does not state one. */
const DEFAULT_INTERVAL_SECONDS = 15 * 60;

/** Rows the latest run recovered from contract state, or 0 when not reported. */
function recoveredRows(asset: IndexerReconcileAsset | null): number {
  return (asset?.recovered_supply ?? 0) + (asset?.recovered_reports ?? 0);
}

/** Unix seconds for an RFC 3339 time, or null when it is absent or unparseable. */
function secs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/** How often the reconciler is scheduled, in words: "15 minutes", "1 hour". */
export function intervalText(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/** An RFC 3339 timestamp in UTC to the second, or null when it is unusable. */
export function reconcileTime(iso: string | null | undefined): string | null {
  const at = secs(iso);
  return at === null ? null : new Date(at * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function notRunning(detail: string): ReconcileSummary {
  return { headline: "Reconciler not running", detail, running: false };
}

/**
 * Sum up the reconciler's last run for one asset.
 *
 * A null status means the indexer does not report one (an older deployment, or
 * the endpoint refused), which is shown as "Reconciler not running" rather than
 * as an error: the page cannot claim a run it cannot see. A job that is on but
 * whose last run is older than three intervals is treated as stopped too, since
 * its schedule says when it should have run again.
 */
export function reconcileSummary(
  status: IndexerReconcileStatus | null,
  sac: string,
  now: number,
): ReconcileSummary {
  if (status === null) {
    return notRunning(
      "The indexer does not report a reconcile status, so any figure it recovered from contract state is not dated here.",
    );
  }
  if (!status.running) {
    return notRunning(
      "The indexer's state reconciler is switched off, so a gap in event ingestion stays a gap until it is turned back on.",
    );
  }

  const asset = (status.assets ?? []).find((a) => a.sac === sac) ?? null;
  const lastRun = secs(asset?.last_run_at ?? status.last_run_at);
  if (lastRun === null) {
    return notRunning("The indexer's state reconciler has not finished a run yet.");
  }

  const age = Math.max(0, now - lastRun);
  const interval =
    typeof status.interval_seconds === "number" && status.interval_seconds > 0
      ? status.interval_seconds
      : DEFAULT_INTERVAL_SECONDS;
  if (age > interval * STALE_INTERVALS) {
    return notRunning(
      `Its last run finished ${ago(age)}, and it is scheduled every ${intervalText(interval)}.`,
    );
  }

  const outcome = asset?.outcome ?? status.last_run_outcome ?? "ok";
  const rows = recoveredRows(asset);
  const error = asset?.error ? `: ${asset.error.slice(0, 200)}` : "";
  const detail =
    outcome === "failed"
      ? `The last run failed${error}. A figure recovered since then may be missing.`
      : rows > 0
        ? `The last run stored ${rows} ${rows === 1 ? "row" : "rows"} that event ingestion had missed.`
        : "The last run found nothing newer than event ingestion had already stored.";

  return { headline: `Reconciled ${ago(age)}`, detail, running: true };
}
