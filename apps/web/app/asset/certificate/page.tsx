"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ago, bpsToPercent, formatUnits, tierLabel, shortAddress, type Tier } from "@plimsoll/sdk";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Skeleton, PlimsollMark, nowSecs } from "@/components/ui";
import { loadAsset, type AssetView } from "@/lib/data";
import styles from "./certificate.module.css";

export default function CertificatePage() {
  return (
    <Suspense fallback={<Skeleton height={40} width="40%" />}>
      <CertificateDetail />
    </Suspense>
  );
}

function CertificateDetail() {
  const sac = useSearchParams().get("sac") ?? "";
  const [asset, setAsset] = useState<AssetView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(nowSecs());

  useEffect(() => {
    if (!sac) return;
    loadAsset(sac)
      .then(setAsset)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [sac]);

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
        Could not load this asset: {error}
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
        This asset is not listed on the coverage ledger. <Link href="/list/">List it</Link>.
      </p>
    );
  }

  const c = asset.coverage;
  const bestReport = c ? (asset.reports[c.tier as Tier] ?? null) : null;

  return (
    <>
      <div className="spread no-print">
        <Breadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: "Assets", href: "/" },
            { label: asset.code, href: `/asset/?sac=${asset.sac}` },
            { label: "Certificate" },
          ]}
        />
        <button className="button no-print" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <div className={styles.certificate}>
        <header className={styles.header}>
          <div className={styles.brandRow}>
            <PlimsollMark size={36} />
            <span className={styles.brandName}>Plimsoll</span>
          </div>
          <h1 className={styles.title}>Reserve Coverage Certificate</h1>
          <p className={styles.subtitle}>
            Generated {new Date(now * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC
          </p>
        </header>

        <section className={styles.section} aria-labelledby="cert-asset-h">
          <h2 id="cert-asset-h" className={styles.sectionHeading}>
            Asset
          </h2>
          <dl className={styles.dl}>
            <div className={styles.dlRow}>
              <dt>Code</dt>
              <dd>
                <strong>{asset.code}</strong>
              </dd>
            </div>
            <div className={styles.dlRow}>
              <dt>Issuer</dt>
              <dd className="mono">{asset.issuer}</dd>
            </div>
            {asset.toml?.org_name ? (
              <div className={styles.dlRow}>
                <dt>Issuer name</dt>
                <dd>{asset.toml.org_name}</dd>
              </div>
            ) : null}
            {asset.toml?.home_domain ? (
              <div className={styles.dlRow}>
                <dt>Home domain</dt>
                <dd>{asset.toml.home_domain}</dd>
              </div>
            ) : null}
            <div className={styles.dlRow}>
              <dt>SAC address</dt>
              <dd className="mono" style={{ wordBreak: "break-all" }}>
                {asset.sac}
              </dd>
            </div>
          </dl>
        </section>

        <section className={styles.section} aria-labelledby="cert-coverage-h">
          <h2 id="cert-coverage-h" className={styles.sectionHeading}>
            Coverage
          </h2>
          {c ? (
            <dl className={styles.dl}>
              <div className={styles.dlRow}>
                <dt>Coverage ratio</dt>
                <dd>
                  <strong className={styles.bigRatio}>{bpsToPercent(c.bps) ?? "—"}</strong>
                </dd>
              </div>
              <div className={styles.dlRow}>
                <dt>Basis points</dt>
                <dd>{c.bps.toLocaleString()} bps</dd>
              </div>
              <div className={styles.dlRow}>
                <dt>Tier</dt>
                <dd>{tierLabel(c.tier)}</dd>
              </div>
              <div className={styles.dlRow}>
                <dt>Circulating supply</dt>
                <dd>{formatUnits(c.supply)}</dd>
              </div>
              <div className={styles.dlRow}>
                <dt>Reserves (reported)</dt>
                <dd>{formatUnits(c.reserves)}</dd>
              </div>
              <div className={styles.dlRow}>
                <dt>Supply as-of</dt>
                <dd>{ago(now - c.supplyPostedAt)} ago</dd>
              </div>
              <div className={styles.dlRow}>
                <dt>Report as-of</dt>
                <dd>{ago(now - c.reportAsOf)} ago</dd>
              </div>
            </dl>
          ) : (
            <p className="sub">No coverage data available for this asset.</p>
          )}
        </section>

        {bestReport ? (
          <section className={styles.section} aria-labelledby="cert-auditor-h">
            <h2 id="cert-auditor-h" className={styles.sectionHeading}>
              Auditor / Reporter
            </h2>
            <dl className={styles.dl}>
              <div className={styles.dlRow}>
                <dt>Reporter address</dt>
                <dd className="mono">{shortAddress(bestReport.reporter, 8)}</dd>
              </div>
              <div className={styles.dlRow}>
                <dt>Reporter (full)</dt>
                <dd className="mono" style={{ wordBreak: "break-all" }}>
                  {bestReport.reporter}
                </dd>
              </div>
              <div className={styles.dlRow}>
                <dt>Document hash (SHA-256)</dt>
                <dd className="mono" style={{ wordBreak: "break-all" }}>
                  {bestReport.docHash}
                </dd>
              </div>
              {bestReport.docUri ? (
                <div className={styles.dlRow}>
                  <dt>Document URI</dt>
                  <dd style={{ wordBreak: "break-all" }}>{bestReport.docUri}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        <footer className={styles.footer}>
          <p>
            Verified on-chain via the Plimsoll coverage ledger ·{" "}
            <span className="mono" style={{ fontSize: "0.75em" }}>
              {shortAddress(asset.sac, 6)}
            </span>
          </p>
          <p className={styles.disclaimer}>
            This certificate is generated from on-chain data. It reflects the state at the time
            shown above and does not constitute financial or legal advice.
          </p>
        </footer>
      </div>
    </>
  );
}
