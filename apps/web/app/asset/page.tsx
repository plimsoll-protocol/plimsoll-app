"use client";

import { safeHref } from "@/lib/safe-href";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  Tier,
  ago,
  checkStellarToml,
  fetchHomeDomain,
  bpsToPercent,
  formatUnits,
  matchesHash,
  parseBreakdown,
  sha256Hex,
  shortAddress,
  tierLabel,
  type IndexerReconcileStatus,
  type SupplyBreakdown,
  type TomlCheck,
} from "@plimsoll/sdk";
import {
  CopyButton,
  Gauge,
  Skeleton,
  Stat,
  StatusPill,
  TierPill,
  nowSecs,
  ratioText,
  statusOf,
} from "@/components/ui";
import { LiveUpdates } from "@/components/LiveUpdates";
import { assetFromSearch } from "@/lib/asset-query";
import { config, explorer } from "@/lib/config";
import { embedCode } from "@/lib/badge";
import { RECONCILE_DOCS, reconcileSummary, reconcileTime } from "@/lib/reconcile";
import {
  contracts,
  indexer,
  loadAsset,
  loadReporterNames,
  type AssetView,
  type Origin,
  type ReportView,
} from "@/lib/data";

export default function AssetPage() {
  return (
    <Suspense fallback={<Skeleton height={40} width="40%" />}>
      <AssetDetail />
    </Suspense>
  );
}

function AssetDetail() {
  const query = assetFromSearch(useSearchParams().toString(), config.network.networkPassphrase);
  const sac = query.ok ? query.sac : "";
  const [asset, setAsset] = useState<AssetView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(nowSecs());
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  // Bumped when the event stream says a new figure has landed, which re-runs
  // the read below without discarding what is already on screen.
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!sac) return;
    let cancelled = false;
    loadAsset(sac)
      .then((a) => {
        if (cancelled) return;
        setAsset(a);
        setNow(nowSecs());
        if (!a) return;
        const addresses = Object.values(a.reports)
          .filter((r): r is ReportView => r !== undefined)
          .map((r) => r.reporter);
        if (a.supply) addresses.push(a.supply.poster);
        // Names are an improvement on the addresses already shown, not a
        // precondition for them, so a failed lookup leaves the page as it is.
        loadReporterNames(addresses)
          .then((n) => {
            if (!cancelled) setNames(n);
          })
          .catch((e: unknown) => console.warn("Could not load reporter names", e));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [sac, refresh]);

  if (!query.ok) {
    return (
      <section className="card mt" aria-labelledby="asset-query-heading">
        <div className="eyebrow">Asset link</div>
        <h1 id="asset-query-heading">
          {query.missing ? "No asset selected" : "That asset link is not valid"}
        </h1>
        <p className={`notice ${query.missing ? "notice-info" : "notice-bad"}`} role="alert">
          {query.error}
        </p>
        <p className="sub">
          Open an asset with <code>?asset=CODE:ISSUER</code> or <code>?sac=C...</code>.
        </p>
        <p>
          <Link href="/">Back to all assets</Link>
        </p>
      </section>
    );
  }
  if (error)
    return (
      <p className="notice notice-bad" role="alert">
        Could not load this asset: {error}
      </p>
    );
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
  const status = statusOf(c?.bps, c?.reportAsOf, c?.supplyPostedAt, now);
  const tiers = [Tier.AuditorSigned, Tier.IssuerSigned, Tier.Transcribed];

  return (
    <>
      <p className="sub">
        <Link href="/">All assets</Link> / {asset.code}{" "}
        <Link href={`/asset/history/?sac=${asset.sac}`} style={{ marginLeft: 8 }}>
          History
        </Link>
      </p>
      <LiveUpdates sac={asset.sac} onRefresh={() => setRefresh((n) => n + 1)} />
      <div className="spread">
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
            <CopyButton value={asset.issuer} label="issuer address" />
            {asset.toml?.home_domain ? <> · {asset.toml.home_domain}</> : null}
            {asset.toml?.org_name ? <> · {asset.toml.org_name}</> : null}
          </div>
        </div>
        <div className="row">
          <StatusPill status={status} />
          {c ? <TierPill tier={c.tier} /> : null}
        </div>
      </div>

      <section className="card mt" aria-labelledby="coverage-h">
        <h2 id="coverage-h" className="sr-only">
          Coverage
        </h2>
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
          <LiveCheck sac={asset.sac} />
        </div>
        <div className="mt">
          <Gauge bps={c?.bps} status={status} />
        </div>
      </section>

      <div className="stats mt">
        <Stat
          label="Circulating supply"
          value={asset.supply ? formatUnits(asset.supply.amount) : "—"}
          sub={
            asset.supply ? `at ledger ${asset.supply.ledger.toLocaleString()}` : "not posted yet"
          }
        />
        <Stat
          label="Supply posted"
          value={asset.supply ? ago(now - asset.supply.postedAt) : "—"}
          sub={asset.supply ? <Provenance view={asset.supply} /> : undefined}
        />
        <Stat
          label="Report as of"
          value={c ? new Date(c.reportAsOf * 1000).toISOString().slice(0, 10) : "—"}
          sub={c ? ago(now - c.reportAsOf) : undefined}
        />
        <Stat
          label="Asset contract"
          value={
            <>
              <span className="mono">{shortAddress(asset.sac, 6)}</span>{" "}
              <CopyButton value={asset.sac} label="asset contract id" />
            </>
          }
          sub={
            <a href={explorer.contract(asset.sac)} target="_blank" rel="noreferrer">
              explorer
            </a>
          }
        />
      </div>

      <h2>Reserve reports</h2>
      <p className="sub">
        Latest report per signer tier. Coverage uses the freshest one. Each report carries the
        SHA-256 of its source document, so you can check the file has not changed.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tier</th>
              <th>Reserves</th>
              <th>Covers</th>
              <th>As of</th>
              <th>Signed by</th>
              <th>Document</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => {
              const r = asset.reports[tier];
              return r ? (
                <ReportRow
                  key={tier}
                  report={r}
                  supply={asset.supply?.amount}
                  issuer={asset.issuer}
                  now={now}
                  name={names.get(r.reporter)}
                />
              ) : (
                <tr key={tier}>
                  <td>{tierLabel(tier)}</td>
                  <td colSpan={5} className="sub">
                    No report at this tier.
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {asset.supply ? (
        <SupplySection
          hash={asset.supply.breakdownHash}
          poster={asset.supply.poster}
          posterName={names.get(asset.supply.poster)}
        />
      ) : null}

      <ReconcileSection sac={asset.sac} />

      <h2>What the issuer publishes</h2>
      <IssuerToml asset={asset} />

      <EmbedBadge sac={asset.sac} />
    </>
  );
}

/**
 * Says how a figure reached us. A figure observed in an event names the
 * transaction that produced it. One the indexer read back from contract state,
 * to fill a gap in event ingestion, has no transaction to name, and saying so
 * is better than leaving a blank where a link usually is.
 */
function Provenance({ view }: { view: { txHash?: string; origin: Origin } }) {
  if (view.txHash) {
    return (
      <a href={explorer.tx(view.txHash)} target="_blank" rel="noreferrer">
        transaction
      </a>
    );
  }
  if (view.origin === "chain") return <>read from contract state, no transaction recorded</>;
  return null;
}

function ReportRow({
  report,
  supply,
  issuer,
  now,
  name,
}: {
  report: ReportView;
  supply: bigint | undefined;
  issuer: string;
  now: number;
  name?: string;
}) {
  const covers =
    supply && supply > 0n ? bpsToPercent(Number((report.amount * 10_000n) / supply)) : "—";
  return (
    <tr>
      <td>
        <TierPill tier={report.tier} />
      </td>
      <td className="num">{formatUnits(report.amount)}</td>
      <td className="num">{covers}</td>
      <td className="num">
        {new Date(report.asOf * 1000).toISOString().slice(0, 10)}
        <div className="sub">{ago(now - report.asOf)}</div>
      </td>
      <td>
        {/* The registry name when there is one, with the address it belongs to
            underneath, so the claim stays checkable against the ledger. An
            issuer signs with its own account and is not a registered reporter,
            so it has no name here and keeps the note it always had. */}
        {name ? <div>{name}</div> : null}
        <a
          className={name ? "mono sub" : "mono"}
          href={explorer.account(report.reporter)}
          target="_blank"
          rel="noreferrer"
        >
          {shortAddress(report.reporter)}
        </a>{" "}
        <CopyButton value={report.reporter} label="reporter address" />
        {report.reporter === issuer ? <div className="sub">issuer account</div> : null}
        <div className="sub">
          <Provenance view={report} />
        </div>
      </td>
      <td>
        {safeHref(report.docUri) ? (
          <>
            <a href={safeHref(report.docUri)} target="_blank" rel="noreferrer">
              Open
            </a>
            <div>
              Hash <span className="mono">{shortAddress(report.docHash, 8)}</span>{" "}
              <CopyButton value={report.docHash} label="document hash" />
            </div>
            <DocCheck uri={report.docUri} hash={report.docHash} />
          </>
        ) : (
          <span className="sub">
            <code>{report.docUri}</code>
            <br />
            Not a web link, so it is shown as text and not checked here.
          </span>
        )}
      </td>
    </tr>
  );
}

type CheckState =
  { kind: "idle" } | { kind: "busy" } | { kind: "ok" } | { kind: "bad"; msg: string };

function DocCheck({ uri, hash }: { uri: string; hash: string }) {
  const [state, setState] = useState<CheckState>({ kind: "idle" });
  const run = useCallback(async () => {
    setState({ kind: "busy" });
    try {
      const res = await fetch(uri);
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const ok = await matchesHash(new Uint8Array(await res.arrayBuffer()), hash);
      setState(ok ? { kind: "ok" } : { kind: "bad", msg: "hash does not match" });
    } catch (e) {
      setState({ kind: "bad", msg: e instanceof Error ? e.message : "could not fetch (CORS?)" });
    }
  }, [uri, hash]);
  return (
    <div className="sub" aria-live="polite">
      {state.kind === "idle" ? (
        <button
          type="button"
          className="secondary"
          style={{ padding: "2px 8px", fontSize: "0.8rem", marginTop: 4 }}
          onClick={run}
        >
          Verify hash
        </button>
      ) : state.kind === "busy" ? (
        "Checking…"
      ) : state.kind === "ok" ? (
        <span style={{ color: "var(--ok)" }}>Hash matches</span>
      ) : (
        <span style={{ color: "var(--bad)" }}>{state.msg}</span>
      )}
    </div>
  );
}

type CoveredParams = { bps: number; days: number; tier: Tier };

/** Parses the form text. Percent may have up to two decimals (whole basis points). */
function parseCoveredParams(
  pct: string,
  days: string,
  tier: string,
): { ok: true; value: CoveredParams } | { ok: false; error: string } {
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(pct.trim())) {
    return {
      ok: false,
      error: "Minimum percentage must be a number from 0 to 1000, with at most two decimals.",
    };
  }
  const bps = Math.round(Number(pct) * 100);
  if (bps > 100_000) return { ok: false, error: "Minimum percentage cannot exceed 1000%." };
  if (!/^\d{1,4}$/.test(days.trim()) || Number(days) < 1 || Number(days) > 3650) {
    return { ok: false, error: "Maximum age must be a whole number of days from 1 to 3650." };
  }
  const t = Number(tier);
  if (t !== Tier.Transcribed && t !== Tier.IssuerSigned && t !== Tier.AuditorSigned) {
    return { ok: false, error: "Choose a minimum tier." };
  }
  return { ok: true, value: { bps, days: Number(days), tier: t } };
}

function coveredCommands(sac: string, p: CoveredParams) {
  const maxAge = p.days * 86_400;
  return {
    cli:
      `stellar contract invoke --network ${config.networkName} --send=no \\\n` +
      `  --id ${config.network.coverageLedgerId} -- \\\n` +
      `  is_covered --sac ${sac} \\\n` +
      `  --min_bps ${p.bps} --max_age ${maxAge} --min_tier ${p.tier}`,
    sdk: `await plimsoll.isCovered("${sac}", ${p.bps}, ${maxAge}, ${p.tier});`,
  };
}

function LiveCheck({ sac }: { sac: string }) {
  const [pct, setPct] = useState("100");
  const [days, setDays] = useState("31");
  const [tier, setTier] = useState(String(Tier.Transcribed));
  const [state, setState] = useState<
    | { kind: "idle" | "busy" }
    | { kind: "done"; text: string; ran: CoveredParams }
    | { kind: "err"; text: string }
  >({ kind: "idle" });
  const parsed = parseCoveredParams(pct, days, tier);
  const run = async () => {
    if (!parsed.ok) return;
    const p = parsed.value;
    setState({ kind: "busy" });
    try {
      const [cov, ok] = await Promise.all([
        contracts.coverage(sac, p.tier),
        contracts.isCovered(sac, p.bps, p.days * 86_400, p.tier),
      ]);
      setState({
        kind: "done",
        ran: p,
        text: cov
          ? `On-chain: ${bpsToPercent(cov.bps) ?? "no supply"} · is_covered(${p.bps / 100}%, ${p.days} days, ${tierLabel(p.tier)}) = ${ok}`
          : "On-chain: no coverage yet",
      });
    } catch (e) {
      setState({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    }
  };
  const shown = state.kind === "done" ? state.ran : parsed.ok ? parsed.value : null;
  const cmds = shown ? coveredCommands(sac, shown) : null;
  return (
    <div style={{ textAlign: "right" }} aria-live="polite">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <label>
          Min coverage %
          <input
            inputMode="decimal"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            aria-invalid={!parsed.ok}
            style={{ width: 90 }}
          />
        </label>
        <label>
          Max age (days)
          <input
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-invalid={!parsed.ok}
            style={{ width: 90 }}
          />
        </label>
        <label>
          Min tier
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            {[Tier.Transcribed, Tier.IssuerSigned, Tier.AuditorSigned].map((t) => (
              <option key={t} value={t}>
                {tierLabel(t)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!parsed.ok ? (
        <div className="sub" role="alert" style={{ marginTop: 6 }}>
          {parsed.error}
        </div>
      ) : null}
      <button
        type="button"
        className="secondary"
        onClick={run}
        disabled={state.kind === "busy" || !parsed.ok}
        style={{ marginTop: 6 }}
      >
        {state.kind === "busy" ? "Reading contract…" : "Check on-chain now"}
      </button>
      {"text" in state ? (
        <div className="sub" style={{ marginTop: 6 }}>
          {state.text}
        </div>
      ) : null}
      {cmds ? (
        <details style={{ marginTop: 6, textAlign: "left" }}>
          <summary>CLI command and SDK call</summary>
          <pre style={{ overflowX: "auto" }}>{cmds.cli}</pre>
          <pre style={{ overflowX: "auto" }}>{cmds.sdk}</pre>
        </details>
      ) : null}
    </div>
  );
}

function SupplySection({
  hash,
  poster,
  posterName,
}: {
  hash: string;
  poster: string;
  posterName?: string;
}) {
  const [breakdown, setBreakdown] = useState<SupplyBreakdown | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  useEffect(() => {
    if (!indexer) return;
    indexer
      .breakdown(hash)
      .then(async (bytes) => {
        setBreakdown(parseBreakdown(bytes));
        setVerified((await sha256Hex(bytes)) === hash);
      })
      .catch(() => setBreakdown(null));
  }, [hash]);

  const rows: [string, keyof SupplyBreakdown][] = [
    ["Trustlines, authorised", "authorized"],
    ["Trustlines, maintain liabilities only", "authorized_to_maintain_liabilities"],
    ["Trustlines, unauthorised", "unauthorized"],
    ["Claimable balances", "claimable_balances"],
    ["Liquidity pools", "liquidity_pools"],
    ["Held by contracts", "contracts"],
  ];
  return (
    <>
      <h2>How supply was counted</h2>
      <p className="sub">
        Posted by {posterName ? `${posterName}, ` : null}
        <a className="mono" href={explorer.account(poster)} target="_blank" rel="noreferrer">
          {shortAddress(poster)}
        </a>
        . Breakdown hash <code className="break">{hash}</code>{" "}
        <CopyButton value={hash} label="breakdown hash" />
      </p>
      {breakdown ? (
        <div className="table-wrap">
          <table>
            <tbody>
              {rows.map(([label, key]) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td className="num">{formatUnits(BigInt(breakdown[key] as string))}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td className="num">
                  <strong>{formatUnits(BigInt(breakdown.total))}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="sub">
          {config.indexerUrl
            ? "Breakdown not available from the indexer."
            : "The per-bucket breakdown is served by the indexer, which this deployment is not using."}
        </p>
      )}
      {verified !== null ? (
        <p className={`notice mt ${verified ? "notice-ok" : "notice-bad"}`}>
          {verified
            ? "The breakdown hashes to the value recorded on-chain."
            : "The breakdown does NOT match the on-chain hash."}
        </p>
      ) : null}
    </>
  );
}

/**
 * The indexer's state reconciler for this asset: when it last ran and whether
 * that run succeeded. Collapsed by default because it is diagnostic detail
 * about where a figure came from, not part of the coverage reading.
 */
function ReconcileSection({ sac }: { sac: string }) {
  const [status, setStatus] = useState<IndexerReconcileStatus | null | undefined>(undefined);
  const [now, setNow] = useState(nowSecs());

  useEffect(() => {
    if (!indexer) return;
    let cancelled = false;
    indexer
      .reconcileStatus(sac)
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        setNow(nowSecs());
      })
      .catch((e: unknown) => {
        // A status that cannot be read is not proof the job is broken, and the
        // section still has to say something: no status reads as not running.
        console.warn("Could not read the reconciler status", e);
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sac]);

  if (!indexer) return null;
  if (status === undefined) return <p className="sub mt">Checking the reconciler…</p>;

  const summary = reconcileSummary(status, sac, now);
  const asset = status?.assets?.find((a) => a.sac === sac) ?? null;
  const lastRun = reconcileTime(asset?.last_run_at ?? status?.last_run_at);
  const outcome = asset?.outcome ?? status?.last_run_outcome ?? null;
  const error = asset?.error ? `: ${asset.error.slice(0, 200)}` : "";

  return (
    <details className="card reconcile mt">
      <summary>
        <span className="eyebrow">Reconciler</span> {summary.headline}
      </summary>
      <p className="sub" style={{ marginTop: 10 }}>
        {summary.detail}
      </p>
      <dl className="reconcile-facts">
        <dt>Last run</dt>
        <dd>{lastRun ? <time dateTime={lastRun}>{lastRun}</time> : "not reported"}</dd>
        <dt>Outcome</dt>
        <dd>
          {outcome === "ok"
            ? "Completed"
            : outcome === "failed"
              ? `Failed${error}`
              : "not reported"}
        </dd>
        <dt>Rows recovered</dt>
        <dd>
          {asset
            ? `${asset.recovered_supply ?? 0} supply, ${asset.recovered_reports ?? 0} report`
            : "not reported for this asset"}
        </dd>
      </dl>
      <p className="sub" style={{ marginBottom: 0 }}>
        <a href={RECONCILE_DOCS} target="_blank" rel="noreferrer">
          How the state reconciler works
        </a>{" "}
        in the indexer docs.
      </p>
    </details>
  );
}

/**
 * The issuer's SEP-1 stellar.toml entry for this asset. Uses the indexer's
 * copy when it confirms the asset; otherwise checks live from the browser,
 * so a newly published file shows up without waiting for the indexer.
 */
function IssuerToml({ asset }: { asset: AssetView }) {
  const cached = asset.toml?.currency ? asset.toml : null;
  const [live, setLive] = useState<{ domain: string; check: TomlCheck } | null>(null);

  useEffect(() => {
    if (cached || !config.network.horizonUrl) return;
    let cancelled = false;
    fetchHomeDomain(config.network.horizonUrl, asset.issuer)
      .then(async (domain) => {
        const check = await checkStellarToml(domain, asset.code, asset.issuer);
        if (!cancelled) setLive({ domain, check });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setLive({
            domain: "",
            check: { status: "unreachable", detail: e instanceof Error ? e.message : String(e) },
          });
      });
    return () => {
      cancelled = true;
    };
  }, [cached, asset.issuer, asset.code]);

  const domain = cached?.home_domain ?? live?.domain ?? "";
  const currency =
    cached?.currency ?? (live?.check.status === "confirmed" ? live.check.currency : undefined);
  const orgName = cached?.org_name ?? live?.check.orgName;

  if (!cached && !live) return <p className="sub">Checking the issuer&apos;s home domain…</p>;

  if (!currency) {
    const reason: Record<TomlCheck["status"], string> = {
      confirmed: "",
      "no-domain": "The issuer account has no home_domain set, so it publishes no stellar.toml.",
      "not-found": `${domain} has no /.well-known/stellar.toml (404).`,
      "not-listed": `The stellar.toml at ${domain} does not list this code and issuer under [[CURRENCIES]].`,
      invalid: `The stellar.toml at ${domain} does not parse as TOML.`,
      unreachable: `The stellar.toml at ${domain} could not be loaded from your browser.`,
    };
    return <p className="sub">{reason[live?.check.status ?? "unreachable"]}</p>;
  }

  const url = `https://${domain}/.well-known/stellar.toml`;
  return (
    <div className="card">
      <p>
        From{" "}
        <a href={url} target="_blank" rel="noreferrer">
          <code>{url}</code>
        </a>{" "}
        (SEP-1){orgName ? <>, published by {orgName}</> : null}.{" "}
        <span className="pill pill-covered">Confirms this issuer</span>
      </p>
      <ul>
        {currency.name ? <li>Name: {currency.name}</li> : null}
        <li>
          Anchored:{" "}
          {currency.is_asset_anchored
            ? `yes, to ${currency.anchor_asset ?? "an off-chain asset"}`
            : "not stated"}
        </li>
        <li>
          Reserve attestation link:{" "}
          {currency.attestation_of_reserve ? (
            safeHref(currency.attestation_of_reserve) ? (
              <a href={safeHref(currency.attestation_of_reserve)} target="_blank" rel="noreferrer">
                {currency.attestation_of_reserve}
              </a>
            ) : (
              <>
                <code>{currency.attestation_of_reserve}</code> (not a web link)
              </>
            )
          ) : (
            "not published"
          )}
        </li>
      </ul>
      <p className="sub" style={{ margin: 0 }}>
        {cached ? "Read by the Plimsoll indexer." : "Checked live from your browser."}
      </p>
    </div>
  );
}

function EmbedBadge({ sac }: { sac: string }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = embedCode(sac, { origin, basePath: config.basePath });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="card mt" aria-labelledby="embed-h">
      <h2 id="embed-h">Embed badge</h2>
      <p className="sub">
        Copy this snippet to show a live reserve-coverage badge that links back to this asset page.
      </p>
      <pre style={{ overflowX: "auto", margin: "8px 0" }}>{snippet}</pre>
      <button type="button" className="secondary" onClick={copy}>
        {copied ? "Copied" : "Copy embed code"}
      </button>
    </section>
  );
}
