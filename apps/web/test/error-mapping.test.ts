import { ContractCallError, LedgerError } from "@plimsoll/sdk";
import { describe, expect, it } from "vitest";
import { ERRORS as LIST_ERRORS, friendly as friendlyList } from "../app/list/page";
import { ERRORS as REPORT_ERRORS, friendly as friendlyReport } from "../app/report/page";

describe("Report page error mapping", () => {
  it("maps #12 (ImplausibleAmount) explaining the 0.01% to 10,000% bounds and unit mistakes", () => {
    const msg = REPORT_ERRORS[12];
    expect(msg).toBeDefined();
    expect(msg).toMatch(/0\.01%/);
    expect(msg).toMatch(/10,000%/);
    expect(msg).toMatch(/unit mistake/i);
    expect(msg).toMatch(/whole units/i);
    expect(msg).toMatch(/smallest units/i);
  });

  it("covers every LedgerError returned by post_reserve", () => {
    // post_reserve error variants:
    // AssetNotListed (3), NotReporter (5), InvalidAmount (6), FutureTimestamp (9),
    // StaleReport (10), InvalidUri (11), ImplausibleAmount (12), TooManyReporters (13)
    const postReserveErrors: LedgerError[] = [
      LedgerError.AssetNotListed,
      LedgerError.NotReporter,
      LedgerError.InvalidAmount,
      LedgerError.FutureTimestamp,
      LedgerError.StaleReport,
      LedgerError.InvalidUri,
      LedgerError.ImplausibleAmount,
      LedgerError.TooManyReporters,
    ];

    for (const code of postReserveErrors) {
      expect(REPORT_ERRORS[code]).toBeDefined();
      expect(typeof REPORT_ERRORS[code]).toBe("string");
      expect(REPORT_ERRORS[code]?.length).toBeGreaterThan(0);
    }
  });

  it("translates ContractCallError for post_reserve errors via friendly()", () => {
    const err12 = new ContractCallError(
      "preparePostReserve",
      "HostError: Error(Contract, #12)",
    );
    expect(err12.code).toBe(12);
    const friendly12 = friendlyReport(err12, err12.message);
    expect(friendly12).toBe(REPORT_ERRORS[12]);
    expect(friendly12).toContain("0.01% to 10,000%");

    const err5 = new ContractCallError(
      "preparePostReserve",
      "HostError: Error(Contract, #5)",
    );
    expect(friendlyReport(err5, err5.message)).toBe(REPORT_ERRORS[5]);
  });

  it("extracts error code from raw simulation error string if not ContractCallError", () => {
    const rawMsg = "Simulation failed: HostError: Error(Contract, #12) during invocation";
    const plainErr = new Error(rawMsg);
    expect(friendlyReport(plainErr, rawMsg)).toBe(REPORT_ERRORS[12]);
  });

  it("falls back to raw fallback message for unmapped errors", () => {
    const fallback = "User rejected the transaction signature.";
    expect(friendlyReport(new Error(fallback), fallback)).toBe(fallback);
  });
});

describe("List page error mapping", () => {
  it("maps NotAStellarAsset and AlreadyListed", () => {
    expect(LIST_ERRORS[LedgerError.NotAStellarAsset]).toContain("Stellar Asset Contract");
    expect(LIST_ERRORS[LedgerError.AlreadyListed]).toContain("already listed");
  });

  it("translates ContractCallError and raw simulation strings in friendly()", () => {
    const err1 = new ContractCallError("list_asset", "HostError: Error(Contract, #1)");
    expect(friendlyList(err1, err1.message)).toContain("Stellar Asset Contract");

    const err2 = new ContractCallError("list_asset", "HostError: Error(Contract, #2)");
    expect(friendlyList(err2, err2.message)).toContain("already listed");

    const rawMsg2 = "Transaction simulation failed: HostError: Error(Contract, #2)";
    expect(friendlyList(new Error(rawMsg2), rawMsg2)).toContain("already listed");
  });

  it("falls back to raw fallback message for unmapped or generic errors", () => {
    const fallback = "Network connection timeout";
    expect(friendlyList(new Error(fallback), fallback)).toBe(fallback);
  });
});
