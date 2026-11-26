"use client";

import { useEffect, useRef } from "react";
import { Tier, bpsToPercent, formatUnits, shortAddress, tierLabel } from "@plimsoll/sdk";

export interface DisputedReportDetails {
  reporter: string;
  reporterName?: string;
  asOf: number;
  bps: number;
  tier?: Tier;
  amount?: bigint;
  sac?: string;
}

export interface DisputeConfirmModalProps {
  isOpen: boolean;
  report: DisputedReportDetails | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
  error?: string | null;
}

export function DisputeConfirmModal({
  isOpen,
  report,
  onConfirm,
  onCancel,
  submitting = false,
  error = null,
}: DisputeConfirmModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  if (!isOpen || !report) return null;

  const asOfDate = new Date(report.asOf * 1000).toISOString().slice(0, 10);
  const formattedPct = bpsToPercent(report.bps);

  return (
    <dialog
      ref={dialogRef}
      className="dispute-dialog"
      aria-labelledby="dispute-dialog-title"
      aria-describedby="dispute-dialog-desc"
      onCancel={(e) => {
        e.preventDefault();
        if (!submitting) onCancel();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current && !submitting) {
          onCancel();
        }
      }}
    >
      <div className="dispute-dialog-head">
        <h2 id="dispute-dialog-title">Dispute reserve report</h2>
        <button
          type="button"
          className="dispute-dialog-close"
          onClick={onCancel}
          disabled={submitting}
          aria-label="Close dialog"
        >
          ✕
        </button>
      </div>

      <div className="dispute-dialog-body" id="dispute-dialog-desc">
        <div className="notice notice-warn" role="alert" style={{ marginBottom: 16 }}>
          <strong>Warning:</strong> This action is on-chain and irreversible. Submitting will record
          a dispute against this report on the coverage ledger.
        </div>

        <div className="card" style={{ padding: "12px 16px", marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Report details
          </div>
          <dl style={{ margin: 0, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <dt style={{ color: "var(--ink-2)" }}>Reporter</dt>
              <dd style={{ margin: 0, textAlign: "right" }} className="mono" data-testid="dispute-reporter">
                {report.reporterName ? (
                  <div>
                    <div>{report.reporterName}</div>
                    <div className="sub">{shortAddress(report.reporter, 6)}</div>
                  </div>
                ) : (
                  shortAddress(report.reporter, 6)
                )}
              </dd>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <dt style={{ color: "var(--ink-2)" }}>As of</dt>
              <dd style={{ margin: 0, textAlign: "right" }} data-testid="dispute-as-of">
                {asOfDate}
              </dd>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <dt style={{ color: "var(--ink-2)" }}>Coverage</dt>
              <dd style={{ margin: 0, textAlign: "right" }} data-testid="dispute-bps">
                {report.bps.toLocaleString()} bps{formattedPct ? ` (${formattedPct})` : ""}
              </dd>
            </div>

            {report.tier !== undefined && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <dt style={{ color: "var(--ink-2)" }}>Tier</dt>
                <dd style={{ margin: 0, textAlign: "right" }}>{tierLabel(report.tier)}</dd>
              </div>
            )}

            {report.amount !== undefined && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <dt style={{ color: "var(--ink-2)" }}>Reserves</dt>
                <dd style={{ margin: 0, textAlign: "right" }}>{formatUnits(report.amount)}</dd>
              </div>
            )}
          </dl>
        </div>

        {error ? (
          <div className="notice notice-bad" role="alert" style={{ marginBottom: 16 }}>
            {error}
          </div>
        ) : null}

        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 16 }}
        >
          <button
            type="button"
            className="secondary"
            onClick={onCancel}
            disabled={submitting}
            data-testid="dispute-cancel-btn"
          >
            Cancel
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => void onConfirm()}
            disabled={submitting}
            data-testid="dispute-confirm-btn"
          >
            {submitting ? "Submitting dispute…" : "Confirm dispute"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export { DisputeConfirmModal as DisputeConfirmDialog };
