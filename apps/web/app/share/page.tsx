"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ago, bpsToPercent, formatUnits, shortAddress, tierLabel } from "@plimsoll/sdk";
import {
  Gauge,
  Skeleton,
  StatusPill,
  TierPill,
  nowSecs,
  ratioText,
  statusOf,
} from "@/components/ui";
import { explorer } from "@/lib/config";
import { loadAsset, type AssetView } from "@/lib/data";

export default function SharePage() {
  return (
    <Suspense fallback={<Skeleton height={40} width="40%" />}>
      <ShareContent />
    </Suspense>
  );
}

function ShareContent() {
  const sac = useSearchParams().get("sac") ?? "";
  const [asset, setAsset] = useState<AssetView | null | undefined>(undefined);
  const [now, setNow] = useState(nowSecs());

  useEffect(() => {
    if (!sac) return;
    loadAsset(sac)
      .then((a) => {
        setAsset(a);
        setNow(nowSecs());
        if (a && typeof document !== "undefined") {
          document.title = `${a.code} coverage · Plimsoll`;
        }
      })
      .catch(() => setAsset(null));
  }, [sac]);

  if (!sac) {
    return (
      <p className="notice notice-info">
        No asset selected. <Link href="/">View all assets</Link>.
      </p>
    );
  }

  if (asset === undefined) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <Skeleton height={40} width="30%" />
        <Skeleton height={60} width="45%" />
        <Skeleton height={14} />
      </div>
    );
  }

  if (asset === null) {
    return (
      <p className="notice notice-info">
        This asset is not listed on the coverage ledger.{" "}
        <Link href="/">View all assets</Link>.
      </p>
    );
  }

  const c = asset.coverage;
  const status = statusOf(c?.bps, c?.reportAsOf, c?.supplyPostedAt, now);

  return (
    <>
      <p className="sub">
        <Link href="/">All assets</Link> / Coverage snapshot
      </p>

      <div className="spread mt">
        <div>
          <h1 style={{ marginBottom: 4 }}>{asset.code}</h1>
          <div className="sub">
            Issuer{" "}
            <a
              className="mono"
              href={explorer.account(asset.issuer)}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddress(asset.issuer, 6)}
            </a>
            {asset.toml?.home_domain ? <> · {asset.toml.home_domain}</> : null}
            {asset.toml?.org_name ? <> · {asset.toml.org_name}</> : null}
          </div>
        </div>
        <div className="row">
          <StatusPill status={status} />
          {c ? <TierPill tier={c.tier} /> : null}
        </div>
      </div>

      <section className="card mt">
        <div className="spread">
          <div>
            <div className="ratio" style={{ fontSize: "2.6rem" }}>
              {ratioText(c?.bps)}
            </div>
            <div className="sub">
              {c
                ? `${formatUnits(c.reserves)} in reserves against ${formatUnits(c.supply)} circulating`
                : "Needs both a supply snapshot and a reserve report."}
            </div>
          </div>
          {c ? (
            <div className="sub" style={{ textAlign: "right" }}>
              <div>Tier: {tierLabel(c.tier)}</div>
              <div>As of {new Date(c.reportAsOf * 1000).toISOString().slice(0, 10)}</div>
              <div>{ago(now - c.reportAsOf)} ago</div>
            </div>
          ) : null}
        </div>
        {c ? (
          <div className="mt">
            <Gauge bps={c.bps} status={status} />
          </div>
        ) : null}
      </section>

      <div className="stats mt">
        <div className="stat">
          <div className="stat-label">Coverage ratio</div>
          <div className="stat-value">{c ? (bpsToPercent(c.bps) ?? "—") : "—"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Circulating supply</div>
          <div className="stat-value">{asset.supply ? formatUnits(asset.supply.amount) : "—"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Reserves</div>
          <div className="stat-value">{c ? formatUnits(c.reserves) : "—"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Report tier</div>
          <div className="stat-value">{c ? tierLabel(c.tier) : "—"}</div>
        </div>
      </div>

      <div className="mt" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href={`/asset/?sac=${encodeURIComponent(sac)}`} className="button secondary">
          Full asset page →
        </Link>
        <button
          className="button secondary"
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.clipboard) {
              void navigator.clipboard.writeText(window.location.href);
            }
          }}
        >
          Copy link
        </button>
      </div>

      <p className="sub mt" style={{ fontSize: "0.82rem" }}>
        Snapshot loaded at {new Date(now * 1000).toUTCString()}. Data from the Plimsoll coverage
        ledger on Stellar.{" "}
        <Link href="/">Learn more</Link>.
      </p>
    </>
  );
}
