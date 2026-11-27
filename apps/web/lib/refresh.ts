"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nowSecs } from "@/components/ui";

/** How often data is read again while the page is open. */
export const REFRESH_INTERVAL_MS = 60_000;

/** How often the clock used for relative ages advances. */
export const AGE_TICK_MS = 15_000;

/** Focus and visibilitychange often fire together; one refresh is enough. */
const MIN_GAP_MS = 1_000;

/**
 * Whether an automatic refresh should run. A hidden tab never refetches, and
 * repeated triggers inside the gap are ignored.
 */
export function shouldRefresh(
  hidden: boolean,
  nowMs: number,
  lastMs: number | undefined,
  minGapMs = MIN_GAP_MS,
): boolean {
  if (hidden) return false;
  return lastMs === undefined || nowMs - lastMs >= minGapMs;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface AutoRefreshOptions {
  intervalMs?: number;
  tickMs?: number;
}

/**
 * Loads once, then keeps data and the clock current while the page is open.
 * The caller owns the data: a failed refresh leaves the last good reading in
 * place, so a slow or broken service never empties the page.
 */
export function useAutoRefresh(load: () => Promise<void>, options: AutoRefreshOptions = {}) {
  const { intervalMs = REFRESH_INTERVAL_MS, tickMs = AGE_TICK_MS } = options;
  const [now, setNow] = useState(nowSecs);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  const inFlight = useRef(false);
  const lastAt = useRef<number | undefined>(undefined);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const run = useCallback((force = false) => {
    if (inFlight.current) return;
    const hidden = typeof document !== "undefined" && document.hidden;
    if (!force && !shouldRefresh(hidden, Date.now(), lastAt.current)) return;
    inFlight.current = true;
    lastAt.current = Date.now();
    setRefreshing(true);
    setError(null);
    void loadRef
      .current()
      .then(() => setNow(nowSecs()))
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => {
        inFlight.current = false;
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    // A forced first load also runs in a background tab: it is not a refetch.
    run(true);
    const polling = window.setInterval(() => run(), intervalMs);
    const clock = window.setInterval(() => setNow(nowSecs()), tickMs);
    const onVisible = () => {
      setNow(nowSecs());
      run();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(polling);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // `load` changes when the selected asset changes; `run` is stable.
  }, [load, run, intervalMs, tickMs]);

  return { now, refreshing, error, refresh: () => run(true) };
}
