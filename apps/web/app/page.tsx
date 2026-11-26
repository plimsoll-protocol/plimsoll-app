"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useEffect, useRef, useState } from "react";
import { AssetCard } from "@/components/AssetCard";
import { CoverageLegend, Skeleton, nowSecs } from "@/components/ui";
import { config } from "@/lib/config";
import { loadAssets, type AssetView } from "@/lib/data";
import { useAutoRefresh, useRefreshIntervalSetting } from "@/lib/refresh-interval";
import { RefreshControls } from "@/components/RefreshControls";

function matchesQuery(a: AssetView, q: string): boolean {
  const lq = q.toLowerCase();
  if (a.code.toLowerCase().includes(lq)) return true;
  if (a.issuer.toLowerCase().includes(lq)) return true;
  if (a.toml?.org_name?.toLowerCase().includes(lq)) return true;
  if (a.toml?.home_domain?.toLowerCase().includes(lq)) return true;
  return false;
}

export function ChainFallbackNotice({ networkName }: { networkName?: string }) {
  const net = networkName ?? config.networkName;
  return (
    <div className="notice notice-warn mt" role="status" data-testid="chain-fallback-notice">
      Reading directly from on-chain storage on {net}. This fallback list may not include every
      listed asset (may be incomplete).
    </div>
  );
}

export default function Home() {
  const [assets, setAssets] = useState<AssetView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(nowSecs());
  const [intervalValue, setIntervalValue] = useRefreshIntervalSetting();
  const cancelRef = useRef<(() => void) | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetch = useCallback(() => {
    if (cancelRef.current) cancelRef.current();
    let cancelled = false;
    cancelRef.current = () => {
      cancelled = true;
    };
    loadAssets()
      .then((list) => {
        if (!cancelled) {
          setAssets(list);
          setNow(nowSecs());
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
import { useCallback, useState } from "react";
import { AssetCard } from "@/components/AssetCard";
import { Skeleton } from "@/components/ui";
import { config } from "@/lib/config";
import { loadAssets, type AssetView } from "@/lib/data";
import { useAutoRefresh } from "@/lib/refresh";

export default function Home() {
  const [assets, setAssets] = useState<AssetView[] | null>(null);
  const load = useCallback(async () => {
    const list = await loadAssets();
    setAssets(list);
  }, []);
  const { now, refreshing, error, refresh } = useAutoRefresh(load);

  const { refresh } = useAutoRefresh(fetch, intervalValue);
  const handleSearch = (value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(value), 200);
  };

  const source = assets?.[0]?.source;
  const filtered =
    assets && debouncedQuery.trim()
      ? assets.filter((a) => matchesQuery(a, debouncedQuery.trim()))
      : assets;

  return (
    <>
      <section className="hero">
        <div className="eyebrow">Reserve coverage for Stellar-issued assets</div>
        <h1>Is it backed? Check before you take it.</h1>
        <p>
          Plimsoll puts each asset&apos;s circulating supply and its latest signed reserve report
          side by side on-chain. You see the ratio, who signed it and how old it is. Any Soroban
          contract can refuse an asset that falls below the line.
        </p>
      </section>

      <CoverageLegend />

      <div className="spread mt">
        <h2 style={{ margin: 0 }}>Listed assets</h2>
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
        <div className="row">
          <span className="sub">
            {source === "indexer"
              ? "Read from the Plimsoll indexer"
              : source === "chain"
                ? `Read directly from the coverage ledger on ${config.networkName}`
                : null}
          </span>
          <RefreshControls
            interval={intervalValue}
            onChange={setIntervalValue}
            onRefresh={refresh}
          />
          <button
            type="button"
            className="secondary"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh listed assets"
            style={{ padding: "3px 10px", fontSize: "0.82rem" }}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {assets !== null ? (
        <div className="mt" style={{ maxWidth: 480 }}>
          <label htmlFor="asset-search" className="sr-only">
            Search assets
          </label>
          <input
            id="asset-search"
            type="search"
            className="search-input"
            placeholder="Search by code, issuer or organisation…"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            aria-label="Search assets by code, issuer or organisation"
          />
        </div>
      ) : null}
      {source === "chain" ? <ChainFallbackNotice /> : null}

      {error ? (
        <p className="notice notice-bad mt" role="alert">
          Could not load assets: {error}
        </p>
      ) : null}

      <div className="grid mt" aria-busy={assets === null}>
        {assets === null && !error
          ? [0, 1].map((i) => (
              <div className="card" key={i} style={{ display: "grid", gap: 12 }}>
                <Skeleton height={26} width="40%" />
                <Skeleton height={36} width="55%" />
                <Skeleton height={14} />
                <Skeleton height={14} width="70%" />
              </div>
            ))
          : filtered?.map((a) => <AssetCard key={a.sac} asset={a} now={now} />)}
      </div>

      {filtered && filtered.length === 0 && debouncedQuery.trim() ? (
        <p className="notice notice-info mt">
          No assets match &ldquo;{debouncedQuery}&rdquo;.
        </p>
      ) : null}

      {assets && assets.length === 0 && !debouncedQuery.trim() ? (
        <p className="notice notice-info mt">
          No assets listed yet. <Link href="/list/">List the first one</Link>.
        </p>
      ) : null}

      <h2>How a reading is made</h2>
      <ol className="steps">
        <li className="card">
          <h3>Supply from the ledger</h3>
          <p className="sub">
            The indexer sums every holding of the asset: trustlines, claimable balances, liquidity
            pools and contract balances. It posts the total on-chain with a hash of the breakdown.
          </p>
        </li>
        <li className="card">
          <h3>Reserves from a signer</h3>
          <p className="sub">
            The issuer&apos;s own account, a registered auditor, or a registered transcriber posts
            the reserve figure with a hash of the source document. The signer decides the tier.
          </p>
        </li>
        <li className="card">
          <h3>One call to check</h3>
          <p className="sub">
            <code>is_covered(asset, min_bps, max_age, min_tier)</code> answers yes or no for any
            contract. <Link href="/integrate/">See the integration guide</Link>.
          </p>
        </li>
      </ol>
    </>
  );
}
