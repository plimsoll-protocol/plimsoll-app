import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchCoverage, type CoverageReading } from "../src/watch";

describe("watchCoverage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onBelow and onAbove only on state transitions", async () => {
    const readings = [
      { bps: 10_500, ages: { report: 60, supply: 60 } }, // above
      { bps: 10_200, ages: { report: 60, supply: 60 } }, // still above -> no duplicate
      { bps: 9_500, ages: { report: 60, supply: 60 } }, // crosses below
      { bps: 9_000, ages: { report: 60, supply: 60 } }, // still below -> no duplicate
      { bps: 10_000, ages: { report: 60, supply: 60 } }, // crosses above (>= threshold)
    ];
    let idx = 0;
    const fetcher = vi.fn(async () => readings[idx++] ?? readings[readings.length - 1]!);

    const aboveEvents: CoverageReading[] = [];
    const belowEvents: CoverageReading[] = [];

    const stop = watchCoverage("CASSET", {
      threshold: 10_000,
      intervalMs: 1_000,
      fetcher,
      onAbove: (r) => aboveEvents.push(r),
      onBelow: (r) => belowEvents.push(r),
    });

    // Initial poll
    await vi.advanceTimersByTimeAsync(0);
    expect(aboveEvents).toHaveLength(1);
    expect(belowEvents).toHaveLength(0);

    // Poll 2: still above -> no duplicate
    await vi.advanceTimersByTimeAsync(1_000);
    expect(aboveEvents).toHaveLength(1);
    expect(belowEvents).toHaveLength(0);

    // Poll 3: crosses below
    await vi.advanceTimersByTimeAsync(1_000);
    expect(aboveEvents).toHaveLength(1);
    expect(belowEvents).toHaveLength(1);
    expect(belowEvents[0]?.status).toBe("under");

    // Poll 4: still below -> no duplicate
    await vi.advanceTimersByTimeAsync(1_000);
    expect(belowEvents).toHaveLength(1);

    // Poll 5: crosses back above
    await vi.advanceTimersByTimeAsync(1_000);
    expect(aboveEvents).toHaveLength(2);
    expect(aboveEvents[1]?.status).toBe("covered");

    stop();

    // No more polls after stop()
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
});
