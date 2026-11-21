"use client";

import { safeHref } from "@/lib/safe-href";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  checkStellarToml,
  fetchAssetRecord,
  fetchHomeDomain,
  formatUnits,
  shortAddress,
  supplyFromRecord,
  type HorizonAssetRecord,
  type SupplyBuckets,
  type TomlCheck,
} from "@plimsoll/sdk";
import { Skeleton } from "@/components/ui";
import { MAINNET_EXPLORER, MAINNET_HORIZON, WATCHED, type WatchedAsset } from "@/lib/mainnet";
import {
  assetKey,
  assetsFromSearch,
  horizonMessage,
  readCache,
  searchFromAssets,
  validateAsset,
  writeCache,
  type AssetRef,
} from "@/lib/watch";

interface Reading {
  record: HorizonAssetRecord | null;
  supply: SupplyBuckets | null;
  domain: string;
  toml: TomlCheck | null;
  error?: string;
}

/** What is kept in sessionStorage: the raw record, so bigint supply is recomputed. */
interface Cached {
  record: HorizonAssetRecord | null;
  domain: string;
  toml: TomlCheck | null;
}

const session = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export default function MainnetPage() {
  const [readings, setReadings] = useState<Record<string, Reading>>({});
  const [readAt, setReadAt] = useState<Date | null>(null);
  const [custom, setCustom] = useState<AssetRef[]>([]);
  const [urlRead, setUrlRead] = useState(false);
  const [code, setCode] = useState("");
  const [issuer, setIssuer] = useState("");
  const [formError, setFormError] = useState("");
  const requested = useRef(new Set<string>());

  // The URL is the source of truth for custom assets, so a shared link reproduces the view.
  useEffect(() => {
    setCustom(assetsFromSearch(window.location.search));
    setUrlRead(true);
  }, []);

  const builtIn = useMemo(() => new Set(WATCHED.map(assetKey)), []);

  const set = useCallback((key: string, r: Reading) => {
    setReadings((prev) => ({ ...prev, [key]: r }));
  }, []);

  useEffect(() => {
    if (!urlRead) return;
    const store = session();
    const all: AssetRef[] = [...WATCHED, ...custom];
    for (const a of all) {
      const key = assetKey(a);
      if (requested.current.has(key)) continue;
      requested.current.add(key);

      const cached = readCache<Cached>(store, key);
      if (cached) {
        set(key, {
          record: cached.record,
          supply: cached.record ? supplyFromRecord(cached.record) : null,
          domain: cached.domain,
          toml: cached.toml,
        });
        continue;
      }

      Promise.all([
        fetchAssetRecord(MAINNET_HORIZON, a.code, a.issuer),
        fetchHomeDomain(MAINNET_HORIZON, a.issuer),
      ])
        .then(([record, domain]) => {
          const supply = record ? supplyFromRecord(record) : null;
          set(key, { record, supply, domain, toml: null });
          if (!record) {
            writeCache<Cached>(store, key, { record, domain, toml: null });
            return undefined;
          }
          return checkStellarToml(domain, a.code, a.issuer).then((toml) => {
            set(key, { record, supply, domain, toml });
            // An unreachable stellar.toml is worth retrying; everything else is an answer.
            if (toml.status !== "unreachable")
              writeCache<Cached>(store, key, { record, domain, toml });
          });
        })
        .catch((err: unknown) => {
          // Failures are not cached, and may be retried by reloading.
          requested.current.delete(key);
          set(key, {
            record: null,
            supply: null,
            domain: "",
            toml: null,
            error: horizonMessage(err),
          });
        });
    }
    setReadAt((prev) => prev ?? new Date());
  }, [urlRead, custom, set]);

  const updateUrl = (next: AssetRef[]) => {
    window.history.replaceState(null, "", `${window.location.pathname}${searchFromAssets(next)}`);
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    const r = validateAsset(code, issuer);
    if (!r.ok) {
      setFormError(r.error);
      return;
    }
    setFormError("");
    const key = assetKey(r.asset);
    if (builtIn.has(key) || custom.some((c) => assetKey(c) === key)) {
      setFormError("That asset is already on the page.");
      return;
    }
    const next = [...custom, r.asset];
    setCustom(next);
    updateUrl(next);
    setCode("");
    setIssuer("");
  };

  const remove = (a: AssetRef) => {
    const next = custom.filter((c) => assetKey(c) !== assetKey(a));
    setCustom(next);
    requested.current.delete(assetKey(a));
    updateUrl(next);
  };

  return (
    <>
      <div className="eyebrow">Live from Stellar mainnet</div>
      <h1>Mainnet watch</h1>
      <p className="sub" style={{ maxWidth: 760 }}>
        The supply half of Plimsoll, on real assets, right now. Each figure below is read from
        mainnet Horizon in your browser and counted with the same rule the Plimsoll indexer posts
        on-chain. The reserve half is what is missing on mainnet today: no issuer below has a signed
        reserve figure that a contract can read.
      </p>

      <form className="stack mt" onSubmit={add} aria-label="Look up a mainnet asset">
        <h2 style={{ margin: 0 }}>Look up any asset</h2>
        <label>
          Asset code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
            placeholder="USDC"
            maxLength={12}
            required
          />
        </label>
        <label>
          Issuer account
          <input
            className="mono"
            value={issuer}
            onChange={(e) => setIssuer(e.target.value.trim())}
            placeholder="G…"
            required
          />
        </label>
        <div aria-live="polite">
          {formError ? <p className="notice notice-bad">{formError}</p> : null}
        </div>
        <div>
          <button type="submit">Add to the page</button>
        </div>
        <p className="sub" style={{ margin: 0 }}>
          The address bar keeps what you add, so you can share the link. Readings are kept for a few
          minutes in this tab, so revisiting does not ask Horizon again.
        </p>
      </form>

      <div className="grid mt">
        {WATCHED.map((a) => (
          <WatchCard key={a.code + a.issuer} asset={a} reading={readings[assetKey(a)]} />
        ))}
        {custom.map((a) => (
          <WatchCard
            key={a.code + a.issuer}
            asset={{ ...a, label: "Custom lookup", kind: "Custom" }}
            reading={readings[assetKey(a)]}
            onRemove={() => remove(a)}
          />
        ))}
      </div>

      <h2>What you are looking at</h2>
      <ul className="sub" style={{ maxWidth: 760 }}>
        <li>
          <strong>Circulating</strong> sums trustlines in every authorisation state, claimable
          balances, liquidity-pool reserves and balances held by Soroban contracts.
        </li>
        <li>
          <strong>Issuer controls</strong> are flags on the issuer account. Clawback and revocation
          mean the issuer can take back or freeze balances; that is normal for regulated assets and
          worth knowing.
        </li>
        <li>
          <strong>stellar.toml</strong> is the issuer&apos;s SEP-1 file. &quot;Confirms this
          issuer&quot; means the file at the issuer&apos;s home domain lists this exact code and
          issuer account. SEP-1 also has an <code>attestation_of_reserve</code> field; it is shown
          when present.
        </li>
        <li>
          Some issuers block automated or regional requests to their stellar.toml. If yours shows
          &quot;could not load&quot;, open the link directly.
        </li>
      </ul>
      {readAt ? (
        <p className="sub">Read at {readAt.toISOString().replace("T", " ").slice(0, 19)} UTC.</p>
      ) : null}
      <p className="mt">
        <Link href="/">See full coverage readings on testnet</Link>
      </p>
    </>
  );
}

const BUCKETS: { key: keyof Omit<SupplyBuckets, "total">; label: string; className: string }[] = [
  { key: "authorized", label: "Trustlines", className: "b-trust" },
  {
    key: "authorizedToMaintainLiabilities",
    label: "Trustlines (restricted)",
    className: "b-restricted",
  },
  { key: "unauthorized", label: "Trustlines (frozen)", className: "b-frozen" },
  { key: "liquidityPools", label: "Liquidity pools", className: "b-pools" },
  { key: "contracts", label: "Soroban contracts", className: "b-contracts" },
  { key: "claimableBalances", label: "Claimable balances", className: "b-claimable" },
];

function share(part: bigint, total: bigint): number {
  return total > 0n ? Number((part * 10_000n) / total) / 100 : 0;
}

function WatchCard({
  asset,
  reading,
  onRemove,
}: {
  asset: WatchedAsset;
  reading: Reading | undefined;
  onRemove?: () => void;
}) {
  const explorer = `${MAINNET_EXPLORER}/asset/${asset.code}-${asset.issuer}`;
  return (
    <section
      className="card"
      style={{ display: "grid", gap: 14 }}
      aria-label={`${asset.code} by ${asset.label}`}
    >
      <div className="asset-head">
        <div>
          <div className="asset-code">{asset.code}</div>
          <div className="sub">
            {asset.label} · {asset.kind}
          </div>
        </div>
        <a className="sub mono" href={explorer} target="_blank" rel="noreferrer">
          {shortAddress(asset.issuer)}
        </a>
      </div>

      {!reading ? (
        <>
          <Skeleton height={34} width="70%" />
          <Skeleton height={12} />
          <Skeleton height={14} width="60%" />
        </>
      ) : reading.error ? (
        <p className="notice notice-bad">{reading.error}</p>
      ) : !reading.supply || !reading.record ? (
        <p className="sub">
          Horizon has no record of {asset.code} issued by this account. Check the code&apos;s
          spelling and case, and the issuer address.
        </p>
      ) : (
        <>
          <div>
            <div className="ratio">{formatUnits(reading.supply.total, 7, 0)}</div>
            <div className="sub">
              circulating · {reading.record.accounts.authorized.toLocaleString()} holders
            </div>
          </div>
          <div>
            <div className="stack-bar" role="img" aria-label="Where the supply sits">
              {BUCKETS.map((b) => {
                const pct = share(reading.supply![b.key], reading.supply!.total);
                return pct > 0 ? (
                  <span key={b.key} className={b.className} style={{ width: `${pct}%` }} />
                ) : null;
              })}
            </div>
            <ul className="legend">
              {BUCKETS.map((b) => {
                const pct = share(reading.supply![b.key], reading.supply!.total);
                return pct >= 0.01 ? (
                  <li key={b.key}>
                    <span className={`swatch ${b.className}`} aria-hidden="true" />
                    {b.label} {pct.toFixed(pct < 1 ? 2 : 1)}%
                  </li>
                ) : null;
              })}
            </ul>
          </div>
          <IssuerFlags flags={reading.record.flags} />
          <TomlLine domain={reading.domain} toml={reading.toml} />
          <p className="sub" style={{ margin: 0 }}>
            On-chain reserve report: <strong>none</strong>.
          </p>
        </>
      )}
      {onRemove ? (
        <div>
          <button type="button" className="secondary" onClick={onRemove}>
            Remove {asset.code}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function IssuerFlags({ flags }: { flags: HorizonAssetRecord["flags"] }) {
  const items = [
    flags.auth_clawback_enabled && "Clawback enabled",
    flags.auth_revocable && "Can freeze balances",
    flags.auth_required && "Holders need approval",
    flags.auth_immutable && "Flags locked",
  ].filter(Boolean) as string[];
  return (
    <div className="row" aria-label="Issuer controls">
      {items.length ? (
        items.map((t) => (
          <span key={t} className="pill pill-unknown">
            {t}
          </span>
        ))
      ) : (
        <span className="pill pill-unknown">No issuer controls set</span>
      )}
    </div>
  );
}

function TomlLine({ domain, toml }: { domain: string; toml: TomlCheck | null }) {
  const url = domain ? `https://${domain}/.well-known/stellar.toml` : "";
  const status = !toml ? (
    "checking…"
  ) : toml.status === "confirmed" ? (
    <span className="pill pill-covered">Confirms this issuer</span>
  ) : toml.status === "not-found" ? (
    <span className="pill pill-under">No stellar.toml at home domain (404)</span>
  ) : toml.status === "not-listed" ? (
    <span className="pill pill-under">Does not list this issuer</span>
  ) : toml.status === "no-domain" ? (
    <span className="pill pill-under">Issuer has no home domain</span>
  ) : toml.status === "invalid" ? (
    <span className="pill pill-stale">stellar.toml does not parse</span>
  ) : (
    <span className="pill pill-stale">Could not load from your browser</span>
  );
  const attestation = toml?.currency?.attestation_of_reserve;
  return (
    <div className="sub" style={{ display: "grid", gap: 6 }}>
      <div>
        stellar.toml{" "}
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            {domain}
          </a>
        ) : null}{" "}
        {status}
      </div>
      {toml?.status === "confirmed" ? (
        <div>
          Reserve attestation link:{" "}
          {attestation ? (
            safeHref(attestation) ? (
              <a href={safeHref(attestation)} target="_blank" rel="noreferrer">
                {attestation.replace(/^https?:\/\//, "").slice(0, 48)}
              </a>
            ) : (
              <>
                <code>{attestation.slice(0, 48)}</code> (not a web link)
              </>
            )
          ) : (
            "not published"
          )}
        </div>
      ) : null}
    </div>
  );
}
