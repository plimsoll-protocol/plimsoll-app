"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { NOTHING_OWED_BPS, ago, shortAddress, type IndexerReporter } from "@plimsoll/sdk";
import { CopyButton, Skeleton, TierPill, nowSecs, ratioText } from "@/components/ui";
import { EXTERNAL_REL, config, explorer } from "@/lib/config";
import { indexer, loadReporterAssets, loadReporters, type ReporterAssets } from "@/lib/data";
import { isReporterRole } from "@/lib/reporters";
import { paginate, reporterFromSearch } from "@/lib/reporter-profile";

export default function ReporterPage() {
  return (
    <Suspense fallback={<Skeleton height={40} width="40%" />}>
      <ReporterDetail />
    </Suspense>
  );
}

/** Singular role label, for "Auditor" rather than the list heading "Auditors". */
const ROLE_LABEL: Record<IndexerReporter["role"], string> = {
  auditor: "Auditor",
  transcriber: "Transcriber",
  supply_poster: "Supply poster",
};

function ReporterDetail() {
  const query = reporterFromSearch(useSearchParams().toString());
  const address = query.ok ? query.address : "";

  return (
    <>
      <p className="sub">
        <Link href="/reporters/">Reporters</Link>
        {address ? <> / {shortAddress(address, 6)}</> : null}
      </p>
      {query.ok ? (
        <ReporterProfile key={address} address={address} />
      ) : (
        <>
          <h1>Reporter</h1>
          <p className={`notice ${query.missing ? "notice-info" : "notice-bad"}`} role="alert">
            {query.error} <Link href="/reporters/">Back to the registry</Link>.
          </p>
        </>
      )}
    </>
  );
}

function ReporterProfile({ address }: { address: string }) {
  const [entry, setEntry] = useState<IndexerReporter | null | undefined>(undefined);
  const [data, setData] = useState<ReporterAssets | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(nowSecs());
  const tableRef = useRef<HTMLDivElement>(null);
  const noIndexer = indexer === null;

  useEffect(() => {
    let cancelled = false;
    // The registry entry only adds a name and role to the page, so a failed
    // lookup leaves the asset list standing.
    loadReporters()
      .then((list) => {
        if (!cancelled) setEntry(list?.find((r) => r.address === address) ?? null);
      })
      .catch((err: unknown) => {
        console.warn("Could not load the reporter registry", err);
        if (!cancelled) setEntry(null);
      });
    loadReporterAssets(address)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setNow(nowSecs());
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const view = useMemo(() => (data ? paginate(data.assets, page) : null), [data, page]);

  const goTo = (next: number) => {
    setPage(next);
    // Keep keyboard and screen reader users at the list they are paging.
    tableRef.current?.focus();
  };

  const role = entry && isReporterRole(entry.role) ? entry.role : null;

  return (
    <>
      <div className="eyebrow">{role ? ROLE_LABEL[role] : "Reporter"}</div>
      <h1 style={{ marginBottom: 4, overflowWrap: "anywhere" }}>
        {entry === undefined && !noIndexer ? (
          <Skeleton height={32} width="40%" />
        ) : (
          entry?.name || shortAddress(address, 8)
        )}
      </h1>
      <div className="sub" style={{ overflowWrap: "anywhere" }}>
        <span className="mono">{address}</span>{" "}
        <CopyButton value={address} label="reporter address" />
      </div>
      <p className="row mt" style={{ flexWrap: "wrap" }}>
        <a
          className="button secondary"
          href={explorer.account(address)}
          target="_blank"
          rel={EXTERNAL_REL}
        >
          View on Stellar Expert
        </a>
      </p>
      {entry === null && !noIndexer ? (
        <p className="notice notice-info mt">
          This address is not an active entry in the reporter registry on {config.networkName}. It
          may have been removed, or it may be an issuer signing its own reports.
        </p>
      ) : null}

      <section className="mt" aria-labelledby="assets-h">
        <div className="spread">
          <h2 id="assets-h" style={{ margin: 0 }}>
            Assets reported on
          </h2>
          {view && view.total > 0 ? (
            <span className="sub">
              {view.total} {view.total === 1 ? "asset" : "assets"}
            </span>
          ) : null}
        </div>
        <p className="sub">
          Every asset this {role ? ROLE_LABEL[role].toLowerCase() : "reporter"} has posted at least
          one reserve report on, with the asset&apos;s latest coverage.
        </p>

        {noIndexer ? (
          <div className="notice notice-info">
            <p>
              This list needs the Plimsoll indexer. The coverage ledger keeps only the latest report
              per tier for each asset, so the chain cannot list every asset an address has reported
              on.
            </p>
            <p>
              Set <code>NEXT_PUBLIC_INDEXER_URL</code> to an indexer&apos;s base URL and rebuild the
              site to show it here.
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="notice notice-bad" role="alert">
            Could not load this reporter&apos;s assets: {error}
          </p>
        ) : null}

        {!noIndexer && !error && data === undefined ? (
          <div aria-busy="true" aria-label="Loading assets" style={{ display: "grid", gap: 12 }}>
            <Skeleton height={14} />
            <Skeleton height={14} width="80%" />
            <Skeleton height={14} width="60%" />
          </div>
        ) : null}

        {data?.basis === "latest" ? (
          <p className="notice notice-info">
            This indexer does not serve full report history by reporter yet, so this list counts
            only the reports that are still the latest for their tier. Assets this reporter reported
            on earlier may be missing.
          </p>
        ) : null}
        {data && !data.complete ? (
          <p className="notice notice-info">
            The indexer returned more report history than this page reads, so the oldest assets may
            be missing.
          </p>
        ) : null}

        {view && view.total === 0 ? (
          <p className="notice notice-info">
            No reserve reports from this address yet. <Link href="/">See all assets</Link>.
          </p>
        ) : null}

        {view && view.total > 0 ? (
          <>
            <div
              className="table-wrap"
              ref={tableRef}
              tabIndex={-1}
              aria-label={`Assets, page ${view.page} of ${view.pageCount}`}
            >
              <table>
                <caption className="sr-only">
                  Assets this reporter has posted reserve reports on, with the asset&apos;s latest
                  coverage and this reporter&apos;s most recent report
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Asset</th>
                    <th scope="col">Coverage</th>
                    <th scope="col">Latest report</th>
                    {data?.basis === "history" ? <th scope="col">Reports</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {view.items.map((row) => (
                    <tr key={row.sac}>
                      <th scope="row">
                        <Link href={`/asset/?sac=${row.sac}`}>
                          {row.code ?? <span className="mono">{shortAddress(row.sac, 6)}</span>}
                        </Link>
                        {row.code ? (
                          <div className="sub mono">{shortAddress(row.sac, 6)}</div>
                        ) : null}
                      </th>
                      <td className="num">
                        {ratioText(row.bps === null ? NOTHING_OWED_BPS : row.bps)}
                      </td>
                      <td>
                        <TierPill tier={row.latestTier} />
                        <div className="sub">
                          {row.latestPostedAt > 0 ? (
                            <time
                              dateTime={new Date(row.latestPostedAt * 1000).toISOString()}
                              title={new Date(row.latestPostedAt * 1000).toUTCString()}
                            >
                              {ago(now - row.latestPostedAt)}
                            </time>
                          ) : (
                            "—"
                          )}
                        </div>
                      </td>
                      {data?.basis === "history" ? (
                        <td className="num">{row.reportCount}</td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {view.pageCount > 1 ? (
              <nav className="spread mt" aria-label="Asset list pages">
                <span className="sub" aria-live="polite">
                  {view.first}–{view.last} of {view.total}
                </span>
                <span className="row">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => goTo(view.page - 1)}
                    disabled={view.page <= 1}
                  >
                    Previous
                  </button>
                  <span className="sub">
                    Page {view.page} of {view.pageCount}
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => goTo(view.page + 1)}
                    disabled={view.page >= view.pageCount}
                  >
                    Next
                  </button>
                </span>
              </nav>
            ) : null}
          </>
        ) : null}
      </section>
      <p className="sub mt">
        <Link href="/about/">How reporters and tiers work</Link>
      </p>
    </>
  );
}
