import { describe, expect, it } from "vitest";
import { AGE_TICK_MS, REFRESH_INTERVAL_MS, errorMessage, shouldRefresh } from "../lib/refresh";

describe("shouldRefresh", () => {
  it("loads when there has been no previous refresh", () => {
    expect(shouldRefresh(false, 10_000, undefined)).toBe(true);
  });

  it("never refetches while the tab is hidden", () => {
    expect(shouldRefresh(true, 10_000, undefined)).toBe(false);
    expect(shouldRefresh(true, 10_000, 0)).toBe(false);
  });

  it("coalesces focus and visibilitychange triggers", () => {
    expect(shouldRefresh(false, 10_500, 10_000)).toBe(false);
    expect(shouldRefresh(false, 11_000, 10_000)).toBe(true);
  });

  it("uses a caller-supplied minimum gap", () => {
    expect(shouldRefresh(false, 10_100, 10_000, 200)).toBe(false);
    expect(shouldRefresh(false, 10_200, 10_000, 200)).toBe(true);
  });
});

describe("refresh timings", () => {
  it("ticks the clock more often than data is refetched", () => {
    expect(AGE_TICK_MS).toBeGreaterThan(0);
    expect(REFRESH_INTERVAL_MS).toBeGreaterThan(AGE_TICK_MS);
  });
});

describe("errorMessage", () => {
  it("uses the message of an Error and the string of anything else", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("nope")).toBe("nope");
  });
});
