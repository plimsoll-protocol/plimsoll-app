import {
  NOTHING_OWED_BPS,
  bpsToPercent,
  coverageStatus,
  tierLabel,
  type CoverageStatus,
  type Tier,
} from "@plimsoll/sdk";

/** The Plimsoll mark: a ring crossed by the load line. */
export function PlimsollMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="11" fill="none" stroke="var(--brand)" strokeWidth="3" />
      <rect x="1" y="14.5" width="30" height="3" rx="1.5" fill="var(--mark)" />
    </svg>
  );
}

const STATUS_TEXT: Record<CoverageStatus, string> = {
  covered: "Fully backed",
  under: "Under-backed",
  stale: "Report stale",
  unknown: "No data",
};

export function StatusPill({ status }: { status: CoverageStatus }) {
  return <span className={`pill pill-${status}`}>{STATUS_TEXT[status]}</span>;
}

export function TierPill({ tier }: { tier: Tier }) {
  return <span className="pill pill-tier">{tierLabel(tier)}</span>;
}

/**
 * The status of a coverage reading, judged as `is_covered` would judge it:
 * against the age of the supply snapshot as well as the report's.
 */
export function statusOf(
  bps: number | undefined,
  reportAsOf: number | undefined,
  supplyPostedAt: number | undefined,
  now: number,
) {
  if (bps === undefined || reportAsOf === undefined) return coverageStatus(null, { report: null });
  return coverageStatus(bps, {
    report: now - reportAsOf,
    supply: supplyPostedAt === undefined ? null : now - supplyPostedAt,
  });
}

export function ratioText(bps: number | undefined): string {
  if (bps === undefined) return "—";
  return bpsToPercent(bps) ?? "No supply";
}

/**
 * Reserves against supply, with the load line at 100%. The bar's scale tops
 * out at 125% so over-collateralisation is visible without dwarfing the line.
 */
export function Gauge({ bps, status }: { bps: number | undefined; status: CoverageStatus }) {
  const max = 12_500;
  const value = bps === undefined ? 0 : bps === NOTHING_OWED_BPS ? max : Math.min(bps, max);
  const pct = (value / max) * 100;
  const linePct = (10_000 / max) * 100;
  return (
    <div>
      <div
        className="gauge"
        role="meter"
        aria-label="Reserves as a share of circulating supply"
        aria-valuemin={0}
        aria-valuemax={125}
        aria-valuenow={bps === undefined ? 0 : Math.min(bps, max) / 100}
      >
        <div className={`gauge-fill ${status}`} style={{ width: `${pct}%` }} />
        <div className="gauge-line" style={{ left: `${linePct}%` }} title="100% backed" />
      </div>
      <div className="gauge-legend">
        <span>0%</span>
        <span style={{ marginLeft: `${linePct - 12}%` }}>100%</span>
        <span>125%+</span>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export function Skeleton({ height = 18, width = "100%" }: { height?: number; width?: string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

export function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}
