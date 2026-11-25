"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { AssetCard } from "@/components/AssetCard";
import { Skeleton, nowSecs } from "@/components/ui";
import { config } from "@/lib/config";
import { loadAssets, type AssetView } from "@/lib/data";
import { useAutoRefresh, useRefreshIntervalSetting } from "@/lib/refresh-interval";
import { RefreshControls } from "@/components/RefreshControls";

export default function Home() {
  const [assets, setAssets] = useState<AssetView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(nowSecs());
  const [intervalValue, setIntervalValue] = useRefreshIntervalSetting();
  const cancelRef = useRef<(() => void) | null>(null);

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
  }, []);

  const { refresh } = useAutoRefresh(fetch, intervalValue);

  const source = assets?.[0]?.source;

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
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
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
        </div>
      </div>

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
          : assets?.map((a) => <AssetCard key={a.sac} asset={a} now={now} />)}
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
