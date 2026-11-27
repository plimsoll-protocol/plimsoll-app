import { describe, expect, it } from "vitest";
import type { IndexerReconcileStatus } from "@plimsoll/sdk";
import { RECONCILE_DOCS, intervalText, reconcileSummary, reconcileTime } from "../lib/reconcile";

const SAC = "CSAC";
const NOW = Date.parse("2026-11-26T12:00:00Z") / 1000;

const status = (over: Partial<IndexerReconcileStatus> = {}): IndexerReconcileStatus => ({
  running: true,
  interval_seconds: 900,
  last_run_at: "2026-11-26T11:58:00Z",
  last_run_outcome: "ok",
  assets: [
    {
      sac: SAC,
      last_run_at: "2026-11-26T11:58:00Z",
      outcome: "ok",
      recovered_supply: 0,
      recovered_reports: 0,
      error: null,
    },
  ],
  ...over,
});

describe("reconcileSummary", () => {
  it("dates the last run in words", () => {
    const s = reconcileSummary(status(), SAC, NOW);
    expect(s.running).toBe(true);
    expect(s.headline).toBe("Reconciled 2 minutes ago");
    expect(s.detail).toMatch(/nothing newer/);
  });

  it("prefers this asset's run over the job's overall run", () => {
    const s = reconcileSummary(
      status({
        last_run_at: "2026-11-26T10:00:00Z",
        assets: [
          {
            sac: SAC,
            last_run_at: "2026-11-26T11:59:00Z",
            outcome: "ok",
            recovered_supply: 0,
            recovered_reports: 0,
          },
        ],
      }),
      SAC,
      NOW,
    );
    expect(s.headline).toBe("Reconciled 1 minute ago");
  });

  it("says not running when the indexer reports no reconcile status", () => {
    const s = reconcileSummary(null, SAC, NOW);
    expect(s.running).toBe(false);
    expect(s.headline).toBe("Reconciler not running");
    expect(s.detail).toMatch(/does not report/);
  });

  it("says not running when the job is switched off or has never finished", () => {
    expect(reconcileSummary(status({ running: false }), SAC, NOW).detail).toMatch(/switched off/);
    expect(reconcileSummary(status({ last_run_at: null, assets: [] }), SAC, NOW).detail).toMatch(
      /has not finished a run/,
    );
    expect(
      reconcileSummary(status({ last_run_at: "not a time", assets: [] }), SAC, NOW).running,
    ).toBe(false);
  });

  it("treats a run older than three intervals as stopped", () => {
    const s = reconcileSummary(
      status({ last_run_at: "2026-11-26T10:00:00Z", assets: [] }),
      SAC,
      NOW,
    );
    expect(s.headline).toBe("Reconciler not running");
    expect(s.detail).toContain("2 hours ago");
    expect(s.detail).toContain("every 15 minutes");
  });

  it("reports a failed run with its message", () => {
    const s = reconcileSummary(
      status({
        assets: [
          {
            sac: SAC,
            last_run_at: "2026-11-26T11:58:00Z",
            outcome: "failed",
            error: "rpc: timeout",
          },
        ],
      }),
      SAC,
      NOW,
    );
    expect(s.running).toBe(true);
    expect(s.detail).toContain("failed: rpc: timeout");
  });

  it("counts the rows the last run recovered", () => {
    const s = reconcileSummary(
      status({
        assets: [
          {
            sac: SAC,
            last_run_at: "2026-11-26T11:58:00Z",
            outcome: "ok",
            recovered_supply: 1,
            recovered_reports: 2,
          },
        ],
      }),
      SAC,
      NOW,
    );
    expect(s.detail).toContain("3 rows");
  });

  it("falls back to the job-wide outcome when the asset is not listed", () => {
    const s = reconcileSummary(status({ assets: [], last_run_outcome: "failed" }), SAC, NOW);
    expect(s.running).toBe(true);
    expect(s.detail).toMatch(/last run failed/);
  });
});

describe("reconcile formatting", () => {
  it("writes intervals as words", () => {
    expect(intervalText(900)).toBe("15 minutes");
    expect(intervalText(60)).toBe("1 minute");
    expect(intervalText(3600)).toBe("1 hour");
    expect(intervalText(7200)).toBe("2 hours");
    expect(intervalText(30)).toBe("1 minute");
  });

  it("shows a run time in UTC to the second, and refuses nonsense", () => {
    expect(reconcileTime("2026-11-26T11:58:12.345Z")).toBe("2026-11-26T11:58:12Z");
    expect(reconcileTime(null)).toBeNull();
    expect(reconcileTime("not a time")).toBeNull();
  });

  it("links the indexer runbook", () => {
    expect(RECONCILE_DOCS).toMatch(/^https:\/\/github\.com\/plimsoll-protocol\/plimsoll-indexer\//);
  });
});
