"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

export type HashVerificationState =
  | { kind: "pending"; checking?: boolean }
  | { kind: "verified" }
  | { kind: "failed"; reason?: "mismatch" | "fetch"; message?: string };

export interface HashVerificationCopy {
  label: string;
  ariaLabel: string;
  tooltip: string;
}

/**
 * Returns plain-language labels and tooltip explanations for each document
 * verification state without contract or protocol jargon.
 */
export function hashVerificationCopy(state: HashVerificationState): HashVerificationCopy {
  switch (state.kind) {
    case "pending":
      return {
        label: state.checking ? "Checking document…" : "Not yet checked",
        ariaLabel: state.checking
          ? "Document verification status: checking"
          : "Document verification status: not yet checked",
        tooltip:
          "Not yet checked. Select Verify hash to download the file and confirm its fingerprint matches the one saved with this report. A mismatch means the file may have changed.",
      };
    case "verified":
      return {
        label: "Hash matches",
        ariaLabel: "Document verification status: verified",
        tooltip:
          "Verified: the downloaded file's fingerprint matches the one saved with this report, confirming the document has not been altered since publication.",
      };
    case "failed":
      return {
        label:
          state.message ??
          (state.reason === "mismatch" ? "Hash does not match" : "Verification failed"),
        ariaLabel: "Document verification status: failed",
        tooltip:
          state.reason === "mismatch"
            ? "Verification failed: the downloaded file does not match the fingerprint saved with this report. This is concerning because the document may have been edited, replaced, or tampered with after publication."
            : "Verification failed: the file could not be downloaded or checked, so its fingerprint could not be confirmed. Treat this report with caution until you can open the file directly, as the link may be broken, blocked, or altered.",
      };
  }
}

function StatusIcon({ kind }: { kind: HashVerificationState["kind"] }) {
  if (kind === "verified") {
    return (
      <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M5.2 8.2L7.1 10.1L11 6.2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "failed") {
    return (
      <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M5.7 5.7L10.3 10.3M10.3 5.7L5.7 10.3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2.5 2"
      />
      <path
        d="M8 4.8V8.2L10.2 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface TooltipCoords {
  top: number;
  left: number;
  maxWidth: number;
  placement: "above" | "below";
}

/**
 * Displays the report document verification icon (pending, verified, or failed)
 * with a keyboard- and screen-reader-accessible plain-language tooltip.
 */
export function HashVerificationStatus({ state }: { state: HashVerificationState }) {
  const tooltipId = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<TooltipCoords | null>(null);
  const copy = hashVerificationCopy(state);

  const openTooltip = useCallback(() => {
    if (typeof window !== "undefined" && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const maxWidth = Math.min(280, Math.max(180, window.innerWidth - 16));
      const idealLeft = rect.left + rect.width / 2 - maxWidth / 2;
      const left = Math.min(Math.max(8, idealLeft), Math.max(8, window.innerWidth - maxWidth - 8));
      const placement = rect.top > 130 ? "above" : "below";
      const top = placement === "above" ? rect.top - 8 : rect.bottom + 8;
      setCoords({ top, left, maxWidth, placement });
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node | null)) {
        setOpen(false);
      }
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", close, { passive: true, capture: true });
    window.addEventListener("resize", close, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <span
      ref={wrapperRef}
      className="hash-status"
      onMouseEnter={openTooltip}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`hash-status-trigger hash-status-${state.kind}`}
        aria-label={copy.ariaLabel}
        aria-describedby={tooltipId}
        aria-expanded={open}
        onFocus={openTooltip}
        onBlur={(event) => {
          if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) {
            setOpen(false);
          }
        }}
        onClick={() => {
          if (open) setOpen(false);
          else openTooltip();
        }}
      >
        <StatusIcon kind={state.kind} />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={
          open
            ? `hash-tooltip ${
                coords?.placement === "below" ? "hash-tooltip-below" : "hash-tooltip-above"
              }`
            : "sr-only"
        }
        style={
          open && coords
            ? { top: coords.top, left: coords.left, maxWidth: coords.maxWidth }
            : undefined
        }
      >
        {copy.tooltip}
      </span>
    </span>
  );
}
