import { useCallback, useEffect, useRef, useState } from "react";

/** The user-selectable refresh intervals. */
export type RefreshInterval = "off" | "30s" | "60s" | "5m";

export interface RefreshOption {
  value: RefreshInterval;
  label: string;
  /** Milliseconds, or null when disabled. */
  ms: number | null;
}

export const REFRESH_OPTIONS: RefreshOption[] = [
  { value: "off", label: "Off", ms: null },
  { value: "30s", label: "30 s", ms: 30_000 },
  { value: "60s", label: "60 s", ms: 60_000 },
  { value: "5m", label: "5 min", ms: 5 * 60_000 },
];

export const DEFAULT_REFRESH: RefreshInterval = "60s";

const STORAGE_KEY = "plimsoll:refresh-interval";

function safeRead(): RefreshInterval {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && REFRESH_OPTIONS.some((o) => o.value === v)) return v as RefreshInterval;
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_REFRESH;
}

function safeWrite(value: RefreshInterval): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // localStorage unavailable or full
  }
}

/**
 * Returns the current refresh interval setting and a setter that also persists
 * it to localStorage. Initialises from localStorage on first render.
 */
export function useRefreshIntervalSetting(): [RefreshInterval, (v: RefreshInterval) => void] {
  // Start with the default to avoid an SSR mismatch; apply storage on effect.
  const [interval, setIntervalState] = useState<RefreshInterval>(DEFAULT_REFRESH);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    setIntervalState(safeRead());
  }, []);

  const set = useCallback((v: RefreshInterval) => {
    safeWrite(v);
    setIntervalState(v);
  }, []);

  return [interval, set];
}

/**
 * Calls `fn` on mount and then repeatedly at the configured interval.
 * Changing `intervalValue` takes effect immediately (cancels the old timer
 * and starts a fresh one; it does not re-run `fn` on its own).  Changing
 * `key` re-runs `fn` once, for pages whose target (e.g. the asset being
 * viewed) changes during the visit.
 *
 * Returns a `refresh` function the caller can use to trigger an immediate
 * re-fetch and restart the countdown.
 */
export function useAutoRefresh(
  fn: () => void,
  intervalValue: RefreshInterval,
  key: string | number = 0,
): { refresh: () => void } {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const ms = REFRESH_OPTIONS.find((o) => o.value === intervalValue)?.ms ?? null;

  // Run once on mount, and again whenever key changes.
  useEffect(() => {
    fnRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Schedule periodic refreshes whenever ms changes.
  useEffect(() => {
    if (ms === null) return;
    const id = window.setInterval(() => {
      fnRef.current();
    }, ms);
    return () => window.clearInterval(id);
  }, [ms]);

  const refresh = useCallback(() => {
    fnRef.current();
  }, []);

  return { refresh };
}
