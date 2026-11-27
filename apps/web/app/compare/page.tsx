"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { bpsToPercent } from "@plimsoll/sdk";
import { Skeleton } from "@/components/ui";
import { COMPARE_PAGE_PARAM, MAX_COMPARE, parseSelection, seriesColor } from "@/lib/compare";
import { indexer, loadAsset } from "@/lib/data";
import { filterByRange, parseDateRange, toHistoryRows, type HistoryRow } from "@/lib/history";

export default function ComparePage() {
  return (
    <Suspense fallback={<Skeleton height={40} width="40%" />}>
      <CompareDetail />
    </Suspense>
  );
}

interface Series {
  sac: string;
  code: string;
  rows: HistoryRow[];
}

function CompareDetail() {
  const params = useSearchParams();
  const sacs = parseSelection(params, COMPARE_PAGE_PARAM);
  const key = sacs.join(",");
  const [series, setSeries] = useState<Series[] | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // The chart shares the history page's default window so both views agree.
  const range = useMemo(() => parseDateRange(params), [params]);

  useEffect(() => {
    const selected = key ? key.split(",") : [];
    if (selected.length === 0) return;
    if (!indexer) {
      // Deferred so the effect does not set state synchronously on mount.
      void Promise.resolve().then(() =>
        setError("Comparison requires the Plimsoll indexer, which is not configured."),
      );
      return;
    }
    const client = indexer;
    let cancelled = false;
    Promise.allSettled(
      selected.map(async (sac) => {
        const [reports, asset] = await Promise.all([
          client.reportHistory(sac, 500),
          loadAsset(sac),
        ]);
        return {
          sac,
          code: asset?.code ?? `${sac.slice(0, 4)}…${sac.slice(-4)}`,
          rows: toHistoryRows(reports, asset?.supply?.amount ?? null),
        };
      }),
    ).then((results) => {
      if (cancelled) return;
      const loaded: Series[] = [];
      const missed: string[] = [];
      results.forEach((result, i) => {
        if (result.status === "fulfilled") loaded.push(result.value);
        else missed.push(selected[i] ?? "");
      });
      if (loaded.length === 0) {
        const reason = results.find((r) => r.status === "rejected");
        setError(
          reason && reason.status === "rejected"
            ? reason.reason instanceof Error
              ? reason.reason.message
              : String(reason.reason)
            : "Could not load coverage history.",
        );
        return;
      }
      setSeries(loaded);
      setFailed(missed.filter((s) => s.length > 0));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (sacs.length === 0) {
    return (
      <p className="notice notice-info">
        No assets selected. Pick up to {MAX_COMPARE} on the <Link href="/">dashboard</Link> and
        choose Compare selected.
      </p>
    );
  }

  if (error) {
    return (
      <p className="notice notice-bad" role="alert">
        Could not load the comparison: {error} <Link href="/">Back to assets</Link>.
      </p>
    );
  }

  if (series === null) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <Skeleton height={40} width="30%" />
        <Skeleton height={260} />
      </div>
    );
  }

  const shown = series.map((s) => ({
    ...s,
    rows: filterByRange(s.rows, range),
  }));
  const withData = shown.filter((s) => s.rows.some((r) => r.bps !== null));

  return (
    <>
      <p className="sub">
        <Link href="/">All assets</Link> / Coverage comparison
      </p>
      <h1>Coverage comparison</h1>
      <p className="sub">
        Reserve coverage of up to {MAX_COMPARE} assets on the same axes. BPS is computed against
        each asset&apos;s current circulating supply, over the same default window as the history
        page.
      </p>

      {failed.length > 0 ? (
        <p className="notice notice-warn" role="alert">
          Could not load history for {failed.length} selected asset{failed.length === 1 ? "" : "s"};
          the chart shows the rest.
        </p>
      ) : null}

      {withData.length === 0 ? (
        <p className="notice notice-info mt">
          No coverage history in this window yet.{" "}
          <Link href={`/asset/history/?sac=${sacs[0] ?? ""}`}>Open an asset history</Link>.
        </p>
      ) : (
        <>
          <ul className="legend compare-legend" aria-label="Compared assets">
            {shown.map((s, i) => {
              const latest = s.rows
                .filter((r): r is HistoryRow & { bps: number } => r.bps !== null)
                .sort((a, b) => b.timestamp - a.timestamp)[0];
              return (
                <li key={s.sac}>
                  <span
                    className="swatch"
                    style={{ background: seriesColor(i) }}
                    aria-hidden="true"
                  />
                  <Link href={`/asset/?sac=${s.sac}`}>{s.code}</Link>
                  {latest ? <span>· {bpsToPercent(latest.bps) ?? "no supply"}</span> : null}
                </li>
              );
            })}
          </ul>
          <div className="compare-chart mt">
            <CompareChart series={withData} order={shown} />
          </div>
          <p className="sub">
            Dashed line marks 100% backed. Each line is one asset; colours follow the legend above.
          </p>
        </>
      )}
    </>
  );
}

interface PlottedPoint {
  timestamp: number;
  bps: number;
}

function CompareChart({ series, order }: { series: Series[]; order: Series[] }) {
  const plotted = series.map((s) => ({
    series: s,
    index: order.findIndex((o) => o.sac === s.sac),
    points: s.rows
      .filter((r): r is HistoryRow & { bps: number } => r.bps !== null)
      .map((r): PlottedPoint => ({ timestamp: r.timestamp, bps: r.bps })),
  }));

  const allPoints = plotted.flatMap((p) => p.points);
  if (allPoints.length === 0) return null;

  const minTs = Math.min(...allPoints.map((p) => p.timestamp));
  const maxTs = Math.max(...allPoints.map((p) => p.timestamp));
  const tsSpan = maxTs - minTs || 1;
  const topBps = Math.max(...allPoints.map((p) => p.bps), 10_000);
  const step = topBps > 20_000 ? 10_000 : 5_000;
  const maxBps = Math.ceil(topBps / step) * step;

  const W = 720;
  const H = 260;
  const PAD = { top: 12, right: 16, bottom: 28, left: 52 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const cx = (ts: number) => PAD.left + ((ts - minTs) / tsSpan) * plotW;
  const cy = (bps: number) => PAD.top + (1 - Math.min(bps, maxBps) / maxBps) * plotH;

  const xTicks = [0, 1 / 3, 2 / 3, 1].map((f) => minTs + f * tsSpan);
  const yTicks: number[] = [];
  for (let v = 0; v <= maxBps; v += step) yTicks.push(v);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Coverage history compared for ${plotted.map((p) => p.series.code).join(", ")}`}
    >
      {/* Horizontal grid and percentage labels */}
      {yTicks.map((v) => (
        <g key={`y-${v}`}>
          <line
            x1={PAD.left}
            y1={cy(v)}
            x2={W - PAD.right}
            y2={cy(v)}
            stroke="var(--line)"
            strokeWidth="1"
          />
          <text
            x={PAD.left - 6}
            y={cy(v)}
            textAnchor="end"
            fontSize="11"
            fill="var(--ink-3)"
            dominantBaseline="middle"
          >
            {`${v / 100}%`}
          </text>
        </g>
      ))}

      {/* 100% reference line */}
      <line
        x1={PAD.left}
        y1={cy(10_000)}
        x2={W - PAD.right}
        y2={cy(10_000)}
        stroke="var(--ok)"
        strokeWidth="1"
        strokeDasharray="4 2"
        opacity="0.7"
      />

      {/* Axes */}
      <line
        x1={PAD.left}
        y1={PAD.top}
        x2={PAD.left}
        y2={PAD.top + plotH}
        stroke="var(--line)"
        strokeWidth="1"
      />
      <line
        x1={PAD.left}
        y1={PAD.top + plotH}
        x2={W - PAD.right}
        y2={PAD.top + plotH}
        stroke="var(--line)"
        strokeWidth="1"
      />

      {/* Date labels */}
      {xTicks.map((ts, i) => (
        <text
          key={`x-${i}`}
          x={cx(ts)}
          y={PAD.top + plotH + 18}
          textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
          fontSize="11"
          fill="var(--ink-3)"
        >
          {new Date(ts * 1000).toISOString().slice(0, 10)}
        </text>
      ))}

      {/* One line and dot set per asset */}
      {plotted.map((p) => {
        const color = seriesColor(p.index);
        return (
          <g key={p.series.sac}>
            <polyline
              points={p.points
                .map((pt) => `${cx(pt.timestamp).toFixed(1)},${cy(pt.bps).toFixed(1)}`)
                .join(" ")}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {p.points.map((pt, i) => (
              <circle
                key={`${p.series.sac}-${i}`}
                cx={cx(pt.timestamp)}
                cy={cy(pt.bps)}
                r={2.5}
                fill={color}
              >
                <title>
                  {`${p.series.code} ${new Date(pt.timestamp * 1000).toISOString().slice(0, 10)}: ${bpsToPercent(pt.bps) ?? "no supply"}`}
                </title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
