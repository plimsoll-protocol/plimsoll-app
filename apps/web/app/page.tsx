"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AssetCard } from "@/components/AssetCard";
import { Skeleton, nowSecs } from "@/components/ui";
import {
  MAX_COMPARE,
  COMPARE_PARAM,
  comparisonHref,
  parseSelection,
  toggleSelection,
} from "@/lib/compare";
import { config } from "@/lib/config";
import { loadAssets, type AssetView } from "@/lib/data";

export default function Home() {
  return (
    <Suspense fallback={<Skeleton height={40} width="40%" />}>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const selected = parseSelection(new URLSearchParams(params.toString()));
  const [assets, setAssets] = useState<AssetView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(nowSecs());

  useEffect(() => {
    let cancelled = false;
    loadAssets()
      .then((list) => {
        if (!cancelled) {
          setAssets(list);
          setNow(nowSecs());
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const source = assets?.[0]?.source;
  const full = selected.length >= MAX_COMPARE;

  const applySelection = (next: string[]) => {
    const url = new URL(window.location.href);
    if (next.length === 0) url.searchParams.delete(COMPARE_PARAM);
    else url.searchParams.set(COMPARE_PARAM, next.join(","));
    router.replace(url.pathname + url.search, { scroll: false });
  };

  const toggle = (sac: string) => applySelection(toggleSelection(selected, sac));

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

      <div className="spread mt">
        <h2 style={{ margin: 0 }}>Listed assets</h2>
        <span className="sub">
          {source === "indexer"
            ? "Read from the Plimsoll indexer"
            : source === "chain"
              ? `Read directly from the coverage ledger on ${config.networkName}`
              : null}
        </span>
      </div>

      <section className="card compare-bar mt" aria-label="Compare assets">
        <div>
          <strong aria-live="polite">
            {selected.length} of {MAX_COMPARE} selected
          </strong>
          <div className="sub">
            Pick up to five assets to plot their coverage histories on one chart.
          </div>
        </div>
        <div className="row">
          {selected.length > 0 ? (
            <Link className="button" href={comparisonHref(selected)}>
              Compare selected
            </Link>
          ) : (
            <button type="button" disabled aria-describedby="compare-bar-hint">
              Compare selected
            </button>
          )}
          <button
            type="button"
            className="secondary"
            onClick={() => applySelection([])}
            disabled={selected.length === 0}
          >
            Clear all
          </button>
        </div>
        <span id="compare-bar-hint" className="sr-only">
          Select at least one asset with the Compare checkboxes on the cards below.
        </span>
      </section>

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
          : assets?.map((a) => (
              <AssetCard
                key={a.sac}
                asset={a}
                now={now}
                selection={{
                  checked: selected.includes(a.sac),
                  disabled: full && !selected.includes(a.sac),
                  onToggle: () => toggle(a.sac),
                }}
              />
            ))}
      </div>

      {assets && assets.length === 0 ? (
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
