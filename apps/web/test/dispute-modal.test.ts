import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DisputeConfirmModal,
  type DisputedReportDetails,
} from "../components/DisputeConfirmModal";
import { Tier } from "@plimsoll/sdk";

describe("DisputeConfirmModal", () => {
  const sampleReport: DisputedReportDetails = {
    reporter: "GBJ5WCO26MCEVRXWNZXHYR7Z2F5W2I35KAPF65F6H3ZPY34XG5T6R5PL",
    reporterName: "Acme Audit LLC",
    asOf: 1715000000,
    bps: 10500,
    tier: Tier.AuditorSigned,
    amount: 100_000_000_000n,
    sac: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  };

  it("does not render when isOpen is false", () => {
    const html = renderToStaticMarkup(
      createElement(DisputeConfirmModal, {
        isOpen: false,
        report: sampleReport,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
    );
    expect(html).toBe("");
  });

  it("does not render when report is null", () => {
    const html = renderToStaticMarkup(
      createElement(DisputeConfirmModal, {
        isOpen: true,
        report: null,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
    );
    expect(html).toBe("");
  });

  it("shows report details including reporter, as-of, and bps", () => {
    const html = renderToStaticMarkup(
      createElement(DisputeConfirmModal, {
        isOpen: true,
        report: sampleReport,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
    );

    // Reporter
    expect(html).toContain("Acme Audit LLC");
    expect(html).toContain("GBJ5WC…6R5PL");

    // As of date
    const expectedDate = new Date(sampleReport.asOf * 1000).toISOString().slice(0, 10);
    expect(html).toContain(expectedDate);

    // BPS
    expect(html).toContain("10,500 bps");
    expect(html).toContain("105.00%");
  });

  it("warns that the action is on-chain and irreversible", () => {
    const html = renderToStaticMarkup(
      createElement(DisputeConfirmModal, {
        isOpen: true,
        report: sampleReport,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
    );

    expect(html).toContain("on-chain and irreversible");
  });

  it("renders cancel and confirm action buttons", () => {
    const html = renderToStaticMarkup(
      createElement(DisputeConfirmModal, {
        isOpen: true,
        report: sampleReport,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
    );

    expect(html).toContain("Cancel");
    expect(html).toContain("Confirm dispute");
  });

  it("cancel aborts without any chain interaction", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    onCancel();

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirm triggers the transaction callback", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    onConfirm();

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
