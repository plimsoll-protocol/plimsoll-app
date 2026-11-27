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

/**
 * Copies text via a hidden offscreen textarea when the async Clipboard API is
 * unavailable or blocked.
 */
export function fallbackCopyText(
  value: string,
  doc: Document | undefined = typeof document === "undefined" ? undefined : document,
): boolean {
  if (!doc || !doc.body || typeof doc.createElement !== "function") return false;
  const textarea = doc.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  const previousFocus =
    typeof HTMLElement !== "undefined" && doc.activeElement instanceof HTMLElement
      ? doc.activeElement
      : null;
  doc.body.appendChild(textarea);
  try {
    if (typeof textarea.focus === "function") {
      textarea.focus({ preventScroll: true });
    }
    textarea.select();
    if (typeof textarea.setSelectionRange === "function") {
      textarea.setSelectionRange(0, value.length);
    }
    return typeof doc.execCommand === "function" ? doc.execCommand("copy") : false;
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (previousFocus && doc.body.contains(previousFocus)) {
      previousFocus.focus({ preventScroll: true });
    }
  }
}

export async function copyToClipboard(
  value: string,
  clipboard?: Pick<Clipboard, "writeText">,
  doc?: Document,
): Promise<boolean> {
  const target = clipboard ?? (typeof navigator === "undefined" ? undefined : navigator.clipboard);
  if (target) {
    try {
      await target.writeText(value);
      return true;
    } catch {
      // Fall back to a temporary textarea when the Clipboard API is denied.
    }
  }
  return fallbackCopyText(value, doc);
}

export function copyAnnouncement(copied: boolean): string {
  return copied ? "Copied" : "Could not copy";
}

function CopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M3.5 8.5L6.5 11.5L12.5 5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect
        x="5.5"
        y="5.5"
        width="7.5"
        height="8"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M3.5 10.5H3A1.5 1.5 0 0 1 1.5 9V3A1.5 1.5 0 0 1 3 1.5H9A1.5 1.5 0 0 1 10.5 3V3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CopyButton({
  value,
  label,
  disabled = false,
  variant = "text",
}: {
  value: string;
  label: string;
  disabled?: boolean;
  variant?: "text" | "icon";
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );

  const copy = async () => {
    if (disabled) return;
    setStatus("idle");
    const copied = await copyToClipboard(value);
    setStatus(copied ? "copied" : "failed");
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setStatus("idle"), 2000);
  };

  return (
    <span
      className="copy-button"
      onKeyDown={(event) => {
        if (event.key === "Escape" && status !== "idle") {
          setStatus("idle");
        }
      }}
    >
      <button
        type="button"
        className={
          variant === "icon"
            ? "secondary copy-trigger copy-trigger-icon"
            : "secondary copy-trigger"
        }
        onClick={copy}
        disabled={disabled}
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
      >
        {variant === "icon" ? <CopyIcon copied={status === "copied"} /> : "Copy"}
      </button>
      {status !== "idle" ? (
        <span
          className={status === "copied" ? "copy-tooltip" : "copy-tooltip copy-tooltip-error"}
          role="tooltip"
        >
          {status === "copied" ? "Copied!" : "Could not copy"}
        </span>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {status === "idle" ? "" : copyAnnouncement(status === "copied")}
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
  [Tier.AuditorSigned]:
    "Tier 3 — Auditor-signed: reserves independently verified by a registered auditor",
  [Tier.AuditorSigned]: "Tier 3 — Auditor-signed: reserves independently verified by a registered auditor",
  [Tier.IssuerSigned]: "Tier 2 — Issuer-signed: reserves attested directly by the asset issuer",
  [Tier.Transcribed]:
    "Tier 1 — Transcribed: reserves copied from a public source by a registered transcriber",
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
export * from "./HashVerificationStatus";
