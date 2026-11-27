"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_MAX_AGE_SECONDS,
  DEFAULT_MIN_BPS,
  NOTHING_OWED_BPS,
  bpsToPercent,
  coverageStatus,
  tierLabel,
  type CoverageStatus,
  Tier,
} from "@plimsoll/sdk";
import { PlimsollMark } from "./PlimsollMark";

export { PlimsollMark };

export async function copyToClipboard(
  value: string,
  clipboard?: Pick<Clipboard, "writeText">,
): Promise<boolean> {
  const target = clipboard ?? (typeof navigator === "undefined" ? undefined : navigator.clipboard);
  if (!target) return false;
  try {
    await target.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function copyAnnouncement(copied: boolean): string {
  return copied ? "Copied" : "Could not copy";
}

export function CopyButton({
  value,
  label,
  disabled = false,
}: {
  value: string;
  label: string;
  disabled?: boolean;
}) {
  const [message, setMessage] = useState("");
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );

  const copy = async () => {
    if (disabled) return;
    setMessage("");
    const copied = await copyToClipboard(value);
    setMessage(copyAnnouncement(copied));
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setMessage(""), 2000);
  };

  return (
    <span className="copy-button">
      <button
        type="button"
        className="secondary copy-trigger"
        onClick={copy}
        disabled={disabled}
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
      >
        Copy
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {message}
      </span>
    </span>
  );
}

/** The Plimsoll mark: a ring crossed by the load line. */
export function PlimsollMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="11" fill="none" stroke="var(--brand)" strokeWidth="3" />
      <rect x="1" y="14.5" width="30" height="3" rx="1.5" fill="var(--mark)" />
    </svg>
  );
}

const COVERAGE_MATH_URL =
  "https://plimsoll-protocol.gitbook.io/plimsoll-protocol-docs/protocol/coverage-math";

const STATUS_TEXT: Record<CoverageStatus, string> = {
  covered: "Fully backed",
  under: "Under-backed",
  stale: "Report stale",
  unknown: "No data",
};

export function statusExplanation(status: CoverageStatus): string {
  const minimum = bpsToPercent(DEFAULT_MIN_BPS) ?? "100%";
  const maxAge = `${DEFAULT_MAX_AGE_SECONDS / 86_400} days`;
  switch (status) {
    case "covered":
      return `Reported reserves are at least ${minimum} of circulating supply, and both the report and the supply snapshot are no more than ${maxAge} old.`;
    case "under":
      return `The ratio is below ${minimum} of circulating supply, although both the report and the supply snapshot are no more than ${maxAge} old.`;
    case "stale":
      return `The report or the supply snapshot is more than ${maxAge} old, so the ratio is not treated as current even if it meets ${minimum}.`;
    case "unknown":
      return "There is no usable report or supply snapshot, so there is no ratio to compare with the threshold.";
  }
}

export function StatusPill({ status }: { status: CoverageStatus }) {
  return (
    <details className="status-details">
      <summary className={`pill pill-${status}`}>{STATUS_TEXT[status]}</summary>
      <div className="status-detail">
        <p>{statusExplanation(status)}</p>
        <a href={COVERAGE_MATH_URL} target="_blank" rel="noreferrer">
          Coverage math
        </a>
      </div>
    </details>
  );
}

export function CoverageLegend() {
  return (
    <section className="card mt" aria-labelledby="status-legend-heading">
      <h2 id="status-legend-heading" style={{ marginTop: 0 }}>
        What the status means
      </h2>
      <ul className="status-legend">
        {(Object.keys(STATUS_TEXT) as CoverageStatus[]).map((status) => (
          <li key={status}>
            <span className={`pill pill-${status}`}>{STATUS_TEXT[status]}</span>
            <span>{statusExplanation(status)}</span>
          </li>
        ))}
      </ul>
      <p className="sub" style={{ margin: 0 }}>
        Thresholds come from the SDK&apos;s coverage rule and <code>DEFAULT_MAX_AGE_SECONDS</code>.{" "}
        <a href={COVERAGE_MATH_URL} target="_blank" rel="noreferrer">
          Read the coverage math
        </a>
        .
      </p>
    </section>
  );
}

const TIER_CLASS: Record<Tier, string> = {
  1: "pill-tier-1",
  2: "pill-tier-2",
  3: "pill-tier-3",
};

const TIER_TOOLTIP: Record<Tier, string> = {
  1: "Tier 1 — Transcribed: a third party copied the figure from a public source",
  2: "Tier 2 — Issuer-signed: the asset issuer attested the reserve directly",
  3: "Tier 3 — Auditor-signed: an independent auditor verified the reserve",
  [Tier.AuditorSigned]: "pill-tier-3",
  [Tier.IssuerSigned]: "pill-tier-2",
  [Tier.Transcribed]: "pill-tier-1",
};

const TIER_TOOLTIP: Record<Tier, string> = {
  [Tier.AuditorSigned]: "Tier 3 — Auditor-signed: reserves independently verified by a registered auditor",
  [Tier.IssuerSigned]: "Tier 2 — Issuer-signed: reserves attested directly by the asset issuer",
  [Tier.Transcribed]: "Tier 1 — Transcribed: reserves copied from a public source by a registered transcriber",
};

export function TierPill({ tier }: { tier: Tier }) {
  return (
    <span
      className={`pill pill-tier ${TIER_CLASS[tier] ?? ""}`}
      title={TIER_TOOLTIP[tier]}
      aria-label={TIER_TOOLTIP[tier]}
    >
      {tierLabel(tier)}
    </span>
  );
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

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
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

export * from "./DisputeConfirmModal";
