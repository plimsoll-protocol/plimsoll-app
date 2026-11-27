"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ago, shortAddress, Tier, tierLabel } from "@plimsoll/sdk";
import { Skeleton, Stat, nowSecs } from "@/components/ui";
import { config, explorer } from "@/lib/config";
import { indexer, loadReporterNames } from "@/lib/data";
import { loadReporterReports } from "@/lib/reporter-data";
import { ChartBar, ChartPie } from "@/components/charts";

export default function ReporterAnalyticsClient({ address }: { address: string }) {
  const [reporter, setReporter] = useState<{ address: string; name?: string; role: string } | null>(null);
  const [reports, setReports] = useState<
    { sac: string; code: string; issuer: string; report: { tier: Tier; amount: bigint; asOf: number; postedAt: number; reporter: string; docHash: string; docUri: string; txHash?: string; origin: string } }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(nowSecs());

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const load = async () => {
      try {
        const names = await loadReporterNames([address]);
        const name = names.get(address);
        setReporter({ address, name, role: "reporter" });
        const rs = await loadReporterReports(address);
        if (!cancelled) {
          setReports(rs);
          setNow(nowSecs());
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!address) return null;

  const noIndexer = indexer === null;

  const reportsPerDay = reports.reduce<Record<string, number>>((acc, r) => {
    const day = new Date(r.report.asOf * 1000).toISOString().slice(0, 10);
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});

  const tierCounts = reports.reduce<Record<number, number>>((acc, r) => {
    acc[r.report.tier] = (acc[r.report.tier] || 0) + 1;
    return acc;
  }, {});

  const daysSorted = Object.entries(reportsPerDay).sort(([a], [b]) => a.localeCompare(b));
  const barData = daysSorted.map(([date, count]) => ({ label: date, value: count }));

  const pieData = [
    { tier: Tier.AuditorSigned, count: tierCounts[Tier.AuditorSigned] || 0, color: "var(--ok)" },
    { tier: Tier.IssuerSigned, count: tierCounts[Tier.IssuerSigned] || 0, color: "var(--sea)" },
    { tier: Tier.Transcribed, count: tierCounts[Tier.Transcribed] || 0, color: "var(--mark)" },
  ].filter((d) => d.count > 0);

  return (
    <>
      <div className="eyebrow">Reporter analytics</div>
      <div className="spread" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>
            {reporter?.name ? `${reporter.name} ` : null}
            <span className="mono">{shortAddress(address, 8)}</span>
          </h1>
          <p className="sub">
            <Link href={explorer.account(address)} target="_blank" rel="noreferrer">
              View on explorer
            </Link>
          </p>
        </div>
        <div className="row">
          <Link href={`/reporters/`} className="secondary">
            All reporters
          </Link>
        </div>
      </div>

      {noIndexer ? (
        <div className="notice notice-info mt">
          <p>
            Reporter analytics needs the Plimsoll indexer. Set{" "}
            <code>NEXT_PUBLIC_INDEXER_URL</code> to an indexer&apos;s base URL and rebuild the
            site to see charts here.
          </p>
        </div>
      ) : error ? (
        <p className="notice notice-bad mt" role="alert">
          Could not load reporter analytics: {error}
        </p>
      ) : reporter === null ? (
        <div className="mt" aria-busy="true" aria-label="Loading reporter">
          {[0, 1, 2].map((i) => (
            <div className="card" key={i} style={{ display: "grid", gap: 12, marginTop: 16 }}>
              <Skeleton height={24} width="30%" />
              <Skeleton height={14} width="80%" />
            </div>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <p className="notice notice-info mt">
          This reporter has not posted any reports yet.
        </p>
      ) : (
        <>
          <div className="stats mt">
            <Stat label="Total reports" value={reports.length} />
            <Stat
              label="Assets covered"
              value={new Set(reports.map((r) => r.sac)).size}
            />
            <Stat
              label="Latest report"
              value={reports[0] ? ago(now - reports[0].report.postedAt) : "—"}
            />
          </div>

          <section className="card mt" aria-labelledby="reports-per-day">
            <h2 id="reports-per-day">Reports per day</h2>
            <p className="sub">
              Number of reserve reports posted by this reporter, grouped by the report&apos;s as-of date.
            </p>
            {barData.length > 0 ? (
              <ChartBar data={barData} height={280} />
            ) : (
              <p className="sub mt">No report data available.</p>
            )}
          </section>

          <section className="card mt" aria-labelledby="tier-breakdown">
            <h2 id="tier-breakdown">Tier distribution</h2>
            <p className="sub">
              Breakdown of reports by signer tier. Auditor-signed (tier 3) carries the highest
              assurance; transcribed (tier 1) is a third-party transcription of a document.
            </p>
            {pieData.length > 0 ? (
              <ChartPie
                data={pieData.map((d) => ({
                  label: tierLabel(d.tier),
                  value: d.count,
                  color: d.color,
                }))}
                height={280}
              />
            ) : (
              <p className="sub mt">No report data available.</p>
            )}
          </section>

          <section className="card mt" aria-labelledby="recent-reports">
            <h2 id="recent-reports">Recent reports</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Tier</th>
                    <th>Reserves</th>
                    <th>As of</th>
                    <th>Posted</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.slice(0, 20).map((r) => (
                    <tr key={`${r.sac}-${r.report.tier}-${r.report.postedAt}`}>
                      <td>
                        <a href={`/asset/?sac=${r.sac}`}>{r.code}</a>
                        <div className="sub mono">{shortAddress(r.issuer, 6)}</div>
                      </td>
                      <td><span className="pill pill-tier">{tierLabel(r.report.tier)}</span></td>
                      <td className="num">{r.report.amount.toString()}</td>
                      <td className="num">
                        <time dateTime={new Date(r.report.asOf * 1000).toISOString()}>
                          {new Date(r.report.asOf * 1000).toISOString().slice(0, 10)}
                        </time>
                      </td>
                      <td className="num">{ago(now - r.report.postedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {reports.length > 20 && (
              <p className="sub mt">Showing 20 of {reports.length} reports.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}