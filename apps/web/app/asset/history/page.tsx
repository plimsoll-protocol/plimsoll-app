"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ago, bpsToPercent, tierLabel, tierFromName } from "@plimsoll/sdk";
import type { IndexerReport } from "@plimsoll/sdk";
import { Skeleton, nowSecs } from "@/components/ui";
import {
  buildCsv,
  downloadCsv,
  filterByRange,
  parseDateRange,
  toHistoryRows,
  toISODate,
} from "@/lib/history";
import { indexer, loadAsset } from "@/lib/data";

export default function HistoryPage() {
  return (
    <Suspense fallback={<Skeleton height={40} width="40%" />}>
      <HistoryDetail />
    </Suspense>
  );
}

function HistoryDetail() {
  const params = useSearchParams();
  const router = useRouter();
  const sac = params.get("sac") ?? "";

  const range = useMemo(() => parseDateRange(params), [params]);

  const [fromInput, setFromInput] = useState(toISODate(range.from));
  const [toInput, setToInput] = useState(toISODate(range.to));
  const [reports, setReports] = useState<IndexerReport[] | null>(null);
  const [supply, setSupply] = useState<bigint | null>(null);
  const [code, setCode] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(nowSecs());

  useEffect(() => {
    if (!sac) return;
    if (!indexer) {
      // Not a synchronous state update — the effect is guarded by sac so this
      // path only runs once after mount.
      void Promise.resolve().then(() =>
        setError("History requires the Plimsoll indexer, which is not configured."),
      );
      return;
    }
    Promise.all([indexer.reportHistory(sac, 500), loadAsset(sac)])
      .then(([reps, asset]) => {
        setReports(reps);
        setSupply(asset?.supply?.amount ?? null);
        setCode(asset?.code ?? "");
        setNow(nowSecs());
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load history"));
  }, [sac]);

  const allRows = useMemo(() => (reports ? toHistoryRows(reports, supply) : []), [reports, supply]);
  const rows = useMemo(() => filterByRange(allRows, range), [allRows, range]);

  const applyRange = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("from", fromInput);
    url.searchParams.set("to", toInput);
    router.push(url.pathname + url.search);
  }, [fromInput, toInput, router]);

  const handleExport = () => {
    const csv = buildCsv(rows);
    const filename = `plimsoll-${code || sac.slice(0, 8)}-${toISODate(range.from)}-${toISODate(range.to)}.csv`;
    downloadCsv(csv, filename);
  };

  if (!sac) {
    return (
      <p className="notice notice-info">
        No asset selected. <Link href="/">Back to all assets</Link>.
      </p>
    );
  }
  if (error) {
    return (
      <p className="notice notice-bad" role="alert">
        {error}
      </p>
    );
  }
  if (reports === null) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <Skeleton height={40} width="30%" />
        <Skeleton height={300} />
      </div>
    );
  }

  return (
    <>
      <p className="sub">
        <Link href="/">All assets</Link> /{" "}
        <Link href={`/asset/?sac=${sac}`}>{code || sac.slice(0, 8)}</Link> / Coverage history
      </p>
      <h1>Coverage history{code ? ` — ${code}` : ""}</h1>
      <p className="sub">
        Reserve reports posted to the Plimsoll coverage ledger, most recent first. BPS is computed
        against the current circulating supply.
      </p>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-end",
          marginTop: 16,
        }}
      >
        <label style={{ fontWeight: 600, fontSize: "0.93rem", display: "grid", gap: 4 }}>
          From
          <input
            type="date"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
            style={{ width: 160 }}
            aria-label="Start date"
          />
        </label>
        <label style={{ fontWeight: 600, fontSize: "0.93rem", display: "grid", gap: 4 }}>
          To
          <input
            type="date"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
            style={{ width: 160 }}
            aria-label="End date"
          />
        </label>
        <button type="button" onClick={applyRange} style={{ alignSelf: "flex-end" }}>
          Apply
        </button>
        <button
          type="button"
          className="secondary"
          onClick={handleExport}
          disabled={rows.length === 0}
          style={{ alignSelf: "flex-end" }}
          aria-label={`Export ${rows.length} rows as CSV`}
        >
          Export CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="notice notice-info" style={{ marginTop: 16 }}>
          No reports in this range. Try a wider date range.
        </p>
      ) : (
        <>
          <p className="sub" style={{ marginTop: 8 }}>
            Showing {rows.length} report{rows.length !== 1 ? "s" : ""} from {toISODate(range.from)}{" "}
            to {toISODate(range.to)}.
          </p>
          <HistoryChart rows={rows} />
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Coverage</th>
                  <th scope="col">Tier</th>
                  <th scope="col">Reporter</th>
                  <th scope="col">Document</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td className="num">
                      {new Date(row.timestamp * 1000).toISOString().slice(0, 10)}
                      <div className="sub">{ago(now - row.timestamp)}</div>
                    </td>
                    <td className="num">
                      {row.bps !== null ? (bpsToPercent(row.bps) ?? "No supply") : "—"}
                    </td>
                    <td>
                      {(() => {
                        const t = tierFromName(row.tier);
                        return t !== undefined ? tierLabel(t) : row.tier;
                      })()}
                    </td>
                    <td className="mono" style={{ fontSize: "0.82rem" }}>
                      {row.reporter.slice(0, 8)}…{row.reporter.slice(-4)}
                    </td>
                    <td>
                      {row.docUri.startsWith("https://") || row.docUri.startsWith("http://") ? (
                        <a href={row.docUri} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        <span className="sub" title={row.docUri}>
                          {row.docUri.slice(0, 20)}…
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

interface ChartRow {
  timestamp: number;
  bps: number | null;
}

function HistoryChart({ rows }: { rows: ChartRow[] }) {
  const withBps = rows.filter((r): r is ChartRow & { bps: number } => r.bps !== null);
  if (withBps.length === 0) return null;

  const maxBps = Math.max(...withBps.map((r) => r.bps), 10_000);
  const minTs = Math.min(...withBps.map((r) => r.timestamp));
  const maxTs = Math.max(...withBps.map((r) => r.timestamp));
  const tsRange = maxTs - minTs || 1;

  const W = 600;
  const H = 160;
  const PAD = { top: 8, right: 16, bottom: 24, left: 48 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const cx = (ts: number) => PAD.left + ((ts - minTs) / tsRange) * plotW;
  const cy = (bps: number) => PAD.top + (1 - Math.min(bps, maxBps) / maxBps) * plotH;

  const points = withBps.map((r) => `${cx(r.timestamp).toFixed(1)},${cy(r.bps).toFixed(1)}`);
  const polyline = points.join(" ");
  const y100 = cy(10_000);

  return (
    <div className="chart" style={{ maxWidth: W, marginTop: 16 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", display: "block" }}
        role="img"
        aria-label="Coverage BPS over time"
      >
      {/* 100% reference line */}
      {y100 >= PAD.top && y100 <= PAD.top + plotH ? (
        <line
          x1={PAD.left}
          y1={y100}
          x2={W - PAD.right}
          y2={y100}
          stroke="var(--chart-ref)"
          strokeWidth="1"
          strokeDasharray="4 2"
          opacity="0.6"
        />
      ) : null}
      {/* Axes */}
      <line
        x1={PAD.left}
        y1={PAD.top}
        x2={PAD.left}
        y2={PAD.top + plotH}
        stroke="var(--chart-grid)"
        strokeWidth="1"
      />
      <line
        x1={PAD.left}
        y1={PAD.top + plotH}
        x2={W - PAD.right}
        y2={PAD.top + plotH}
        stroke="var(--chart-grid)"
        strokeWidth="1"
      />
      {/* Y-axis label */}
      <text
        x={PAD.left - 6}
        y={PAD.top + plotH / 2}
        textAnchor="end"
        fontSize="10"
        fill="var(--chart-axis)"
        dominantBaseline="middle"
      >
        BPS
      </text>
      {/* Data line */}
      <polyline
        points={polyline}
        fill="none"
        stroke="var(--chart-line)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Dots */}
      {withBps.map((r, i) => (
        <circle
          key={i}
          cx={cx(r.timestamp)}
          cy={cy(r.bps)}
          r={3}
          fill="var(--chart-point)"
          aria-label={`${new Date(r.timestamp * 1000).toISOString().slice(0, 10)}: ${r.bps} BPS`}
        />
      ))}
      </svg>
    </div>
  );
}
