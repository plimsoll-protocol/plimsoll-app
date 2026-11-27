import { PlimsollContracts } from "./contract";
import { coverageStatus, type CoverageAges, type CoverageStatus } from "./format";
import { TESTNET } from "./networks";
import { Tier } from "./types";

export interface CoverageReading {
  bps: number | null | undefined;
  ages: CoverageAges;
  status: CoverageStatus;
}

export interface WatchCoverageOptions {
  /** Coverage threshold in basis points (default: 10_000 = 100%). */
  threshold?: number;
  /** Maximum age in seconds for `coverageStatus` (default: 7 days). */
  maxAgeSeconds?: number;
  /** Polling interval in milliseconds (default: 30_000). */
  intervalMs?: number;
  /** Fired when coverage drops below `threshold` (and on initial poll if below). */
  onBelow?: (reading: CoverageReading) => void;
  /** Fired when coverage rises to or above `threshold` (and on initial poll if above). */
  onAbove?: (reading: CoverageReading) => void;
  /** Optional error handler for failed polls. */
  onError?: (error: unknown) => void;
  /** Optional custom fetcher (defaults to reading from `PlimsollContracts(TESTNET)`). */
  fetcher?: (asset: string) => Promise<{ bps: number | null | undefined; ages: CoverageAges }>;
}

const DEFAULT_THRESHOLD_BPS = 10_000;
const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

async function defaultFetcher(
  asset: string,
): Promise<{ bps: number | null | undefined; ages: CoverageAges }> {
  const contracts = new PlimsollContracts(TESTNET);
  const cov = await contracts.coverage(asset, Tier.Transcribed);
  if (!cov) {
    return { bps: null, ages: { report: null, supply: null } };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    bps: cov.bps,
    ages: {
      report: Math.max(0, nowSec - cov.reportAsOf),
      supply: Math.max(0, nowSec - cov.supplyTimestamp),
    },
  };
}

/**
 * Poll `coverageStatus` for `asset` and invoke `onBelow` / `onAbove` whenever
 * coverage crosses `threshold`. Returns a `stop()` function.
 */
export function watchCoverage(asset: string, options: WatchCoverageOptions = {}): () => void {
  const {
    threshold = DEFAULT_THRESHOLD_BPS,
    maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
    intervalMs = DEFAULT_INTERVAL_MS,
    onBelow,
    onAbove,
    onError,
    fetcher = defaultFetcher,
  } = options;

  let stopped = false;
  let lastState: "above" | "below" | null = null;

  const poll = async (): Promise<void> => {
    if (stopped) return;
    try {
      const raw = await fetcher(asset);
      if (stopped) return;

      const status = coverageStatus(raw.bps, raw.ages, maxAgeSeconds, threshold);
      const reading: CoverageReading = { bps: raw.bps, ages: raw.ages, status };

      if (raw.bps == null) return;

      const nextState: "above" | "below" = raw.bps >= threshold ? "above" : "below";
      if (nextState !== lastState) {
        lastState = nextState;
        if (nextState === "below") {
          onBelow?.(reading);
        } else {
          onAbove?.(reading);
        }
      }
    } catch (err) {
      if (!stopped) {
        onError?.(err);
      }
    }
  };

  void poll();
  const timer = setInterval(() => {
    void poll();
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
