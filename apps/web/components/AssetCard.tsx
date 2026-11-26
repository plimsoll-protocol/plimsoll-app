import Link from "next/link";
import { ago, formatUnits, shortAddress } from "@plimsoll/sdk";
import type { AssetView } from "@/lib/data";
import { Gauge, StatusPill, TierPill, ratioText, statusOf } from "./ui";

export interface AssetSelection {
  checked: boolean;
  /** True when the selection is full and this asset is not in it. */
  disabled: boolean;
  onToggle: () => void;
}

export function AssetCard({
  asset,
  now,
  selection,
}: {
  asset: AssetView;
  now: number;
  selection?: AssetSelection;
}) {
  const c = asset.coverage;
  const status = statusOf(c?.bps, c?.reportAsOf, c?.supplyPostedAt, now);
  return (
    <div className="card asset-card">
      <Link href={`/asset/?sac=${asset.sac}`} className="asset-card-link">
        <div className="asset-head">
          <div>
            <div className="asset-code">{asset.code}</div>
            <div className="sub mono">
              {asset.toml?.home_domain ?? shortAddress(asset.issuer, 6)}
            </div>
          </div>
  const card = (
    <Link href={`/asset/?sac=${asset.sac}`} className="card asset-card">
      <div className="asset-head">
        <div>
          <div className="asset-code">{asset.code}</div>
          <div className="sub mono">{asset.toml?.home_domain ?? shortAddress(asset.issuer, 6)}</div>
        </div>
        <div>
          <div className="ratio">{ratioText(c?.bps)}</div>
          <div className="sub">of circulating supply backed</div>
        </div>
        <Gauge bps={c?.bps} status={status} />
        <div className="spread sub">
          <span>Supply {asset.supply ? formatUnits(asset.supply.amount, 7, 0) : "not posted"}</span>
          <span>{c ? `Report ${ago(now - c.reportAsOf)}` : "No reserve report"}</span>
        </div>
        {c ? (
          <div>
            <TierPill tier={c.tier} />
          </div>
        ) : null}
      </Link>
      <div className="asset-card-status">
        <StatusPill status={status} />
      </div>
    </div>
  );

  if (!selection) return card;

  return (
    <div className="asset-slot" data-selected={selection.checked ? "true" : "false"}>
      <label className="asset-select">
        <input
          type="checkbox"
          checked={selection.checked}
          disabled={selection.disabled}
          onChange={selection.onToggle}
          aria-label={`Select ${asset.code} for comparison`}
        />
        <span>Compare</span>
      </label>
      {card}
    </div>
  );
}
