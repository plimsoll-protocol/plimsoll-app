"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { bpsToPercent, shortAddress } from "@plimsoll/sdk";
import type { CoverageStatus } from "@plimsoll/sdk";
import { Skeleton, StatusPill, nowSecs, statusOf } from "@/components/ui";
import type { AssetView } from "@/lib/data";
import { loadAsset } from "@/lib/data";
import { MAX_WIDGET_ASSETS, parseWidgetAssets } from "@/lib/widget";

const REFRESH_INTERVAL_MS = 60_000;

interface WidgetRow {
  sac: string;
  asset: AssetView | null;
  error: string | null;
}

export default function CoverageWidgetPage() {
  return (
    <Suspense fallback={<WidgetFallback />}>
      <CoverageWidget />
    </Suspense>
  );
}

function CoverageWidget() {
  const params = useSearchParams();
  const parsed = useMemo(() => parseWidgetAssets(params.getAll("sac")), [params]);
  const assetKey = parsed.assets.join(",");
  const [rows, setRows] = useState<WidgetRow[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    setUpdatedAt(null);
    setRefreshing(false);
    setRefreshError(null);
    if (!assetKey) return;

    const assets = assetKey.split(",");
    let cancelled = false;
    let active = false;

    const refresh = async () => {
      if (active) return;
      active = true;
      setRefreshing(true);
      try {
        const nextRows = await Promise.all(
          assets.map(async (sac): Promise<WidgetRow> => {
            try {
              return { sac, asset: await loadAsset(sac), error: null };
            } catch (error) {
              return {
                sac,
                asset: null,
                error: error instanceof Error ? error.message : String(error),
              };
            }
          }),
        );
        if (!cancelled) {
          setRows(nextRows);
          setUpdatedAt(nowSecs());
          setRefreshError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setRefreshError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        active = false;
        if (!cancelled) setRefreshing(false);
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [assetKey]);

  const hasSelection = params.getAll("sac").some((value) => value.trim().length > 0);

  return (
    <section className="coverage-widget" aria-labelledby="coverage-widget-title">
      <div className="coverage-widget-heading">
        <div>
          <div className="eyebrow">Plimsoll</div>
          <h1 id="coverage-widget-title">Coverage watchlist</h1>
        </div>
        <div className="sub coverage-widget-refresh" role="status" aria-live="polite">
          {refreshing
            ? "Refreshing…"
            : updatedAt
              ? `Updated ${new Date(updatedAt * 1000).toLocaleTimeString()}`
              : "Refreshes every 60 seconds"}
        </div>
      </div>

      {parsed.invalidCount > 0 ? (
        <p className="notice notice-bad coverage-widget-notice" role="alert">
          Ignored {parsed.invalidCount} invalid Stellar contract address
          {parsed.invalidCount === 1 ? "" : "es"}.
        </p>
      ) : null}
      {parsed.overflowCount > 0 ? (
        <p className="notice notice-warn coverage-widget-notice" role="alert">
          Showing the first {MAX_WIDGET_ASSETS} valid assets. Remove{" "}
          {parsed.overflowCount === 1
            ? "the extra address"
            : `${parsed.overflowCount} extra addresses`}{" "}
          from the URL to include a different selection.
        </p>
      ) : null}
      {refreshError ? (
        <p className="notice notice-bad coverage-widget-notice" role="alert">
          Could not refresh the watchlist: {refreshError}
        </p>
      ) : null}

      {parsed.assets.length === 0 ? (
        <p className="notice notice-info coverage-widget-notice">
          {hasSelection
            ? "No valid assets were selected. Add a valid contract address with a repeated sac query parameter."
            : "Configure this widget with one or more repeated sac query parameters."}
        </p>
      ) : rows === null ? (
        <WidgetSkeleton />
      ) : (
        <div className="coverage-widget-grid" aria-busy={refreshing}>
          {rows.map((row) => (
            <WidgetAsset key={row.sac} row={row} now={nowSecs()} />
          ))}
        </div>
      )}
    </section>
  );
}

function WidgetAsset({ row, now }: { row: WidgetRow; now: number }) {
  const coverage = row.asset?.coverage;
  const status: CoverageStatus = coverage
    ? statusOf(coverage.bps, coverage.reportAsOf, coverage.supplyPostedAt, now)
    : "unknown";
  const name = row.asset?.code ?? shortAddress(row.sac, 6);
  const ratio = coverage ? (bpsToPercent(coverage.bps) ?? "No supply") : "—";

  return (
    <a className="coverage-widget-card" href={`/asset/?sac=${encodeURIComponent(row.sac)}`}>
      <div className="spread coverage-widget-card-head">
        <strong className="coverage-widget-code">{name}</strong>
        <StatusPill status={status} />
      </div>
      <div className="coverage-widget-ratio">{ratio}</div>
      <div className="sub mono coverage-widget-address">{shortAddress(row.sac, 6)}</div>
      {row.error ? (
        <div className="coverage-widget-error">Could not load coverage: {row.error}</div>
      ) : row.asset === null ? (
        <div className="sub">Asset not found on this network.</div>
      ) : !coverage ? (
        <div className="sub">No coverage data yet.</div>
      ) : null}
    </a>
  );
}

function WidgetSkeleton() {
  return (
    <div className="coverage-widget-grid" aria-busy="true" aria-label="Loading coverage">
      {[0, 1].map((item) => (
        <div className="card coverage-widget-card" key={item}>
          <Skeleton height={20} width="45%" />
          <Skeleton height={30} width="35%" />
          <Skeleton height={14} width="65%" />
        </div>
      ))}
    </div>
  );
}

function WidgetFallback() {
  return (
    <section className="coverage-widget" aria-labelledby="coverage-widget-title">
      <div className="coverage-widget-heading">
        <div>
          <div className="eyebrow">Plimsoll</div>
          <h1 id="coverage-widget-title">Coverage watchlist</h1>
        </div>
        <div className="sub coverage-widget-refresh">Refreshes every 60 seconds</div>
      </div>
      <WidgetSkeleton />
    </section>
  );
}
