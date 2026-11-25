import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_REFRESH,
  REFRESH_OPTIONS,
  type RefreshInterval,
} from "../lib/refresh-interval";

// ── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE_KEY = "plimsoll:refresh-interval";

function makeStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

// ── REFRESH_OPTIONS shape ────────────────────────────────────────────────────

describe("REFRESH_OPTIONS", () => {
  it("contains Off / 30s / 60s / 5m in that order", () => {
    expect(REFRESH_OPTIONS.map((o) => o.value)).toEqual(["off", "30s", "60s", "5m"]);
  });

  it("Off has ms === null", () => {
    const off = REFRESH_OPTIONS.find((o) => o.value === "off");
    expect(off?.ms).toBeNull();
  });

  it("60s has ms === 60_000", () => {
    const s60 = REFRESH_OPTIONS.find((o) => o.value === "60s");
    expect(s60?.ms).toBe(60_000);
  });

  it("5m has ms === 300_000", () => {
    const m5 = REFRESH_OPTIONS.find((o) => o.value === "5m");
    expect(m5?.ms).toBe(300_000);
  });

  it("default is 60s", () => {
    expect(DEFAULT_REFRESH).toBe("60s");
  });
});

// ── localStorage persistence helpers (extracted pure-function slice) ─────────
// We test the storage read/write logic directly without React hooks by
// replicating the same storage key and behaviour.

describe("localStorage persistence", () => {
  let store: Storage;

  beforeEach(() => {
    store = makeStorage();
  });

  it("reads DEFAULT_REFRESH when nothing is stored", () => {
    const v = (store.getItem(STORAGE_KEY) as RefreshInterval | null) ?? DEFAULT_REFRESH;
    const valid = REFRESH_OPTIONS.some((o) => o.value === v);
    const result: RefreshInterval = valid ? (v as RefreshInterval) : DEFAULT_REFRESH;
    expect(result).toBe(DEFAULT_REFRESH);
  });

  it("reads back a stored value", () => {
    store.setItem(STORAGE_KEY, "30s");
    const raw = store.getItem(STORAGE_KEY);
    const valid = REFRESH_OPTIONS.some((o) => o.value === raw);
    const result: RefreshInterval = valid && raw ? (raw as RefreshInterval) : DEFAULT_REFRESH;
    expect(result).toBe("30s");
  });

  it("falls back to DEFAULT when an unknown value is stored", () => {
    store.setItem(STORAGE_KEY, "bogus");
    const raw = store.getItem(STORAGE_KEY);
    const valid = REFRESH_OPTIONS.some((o) => o.value === raw);
    const result: RefreshInterval = valid && raw ? (raw as RefreshInterval) : DEFAULT_REFRESH;
    expect(result).toBe(DEFAULT_REFRESH);
  });

  it("persists a new selection", () => {
    store.setItem(STORAGE_KEY, "off");
    expect(store.getItem(STORAGE_KEY)).toBe("off");
  });
});

// ── Interval scheduling (setInterval / clearInterval) ───────────────────────

describe("interval scheduling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires callback after the configured interval", () => {
    const cb = vi.fn();
    const ms = REFRESH_OPTIONS.find((o) => o.value === "30s")!.ms!;
    const id = setInterval(cb, ms);
    vi.advanceTimersByTime(ms);
    expect(cb).toHaveBeenCalledOnce();
    clearInterval(id);
  });

  it("fires multiple times", () => {
    const cb = vi.fn();
    const ms = REFRESH_OPTIONS.find((o) => o.value === "60s")!.ms!;
    const id = setInterval(cb, ms);
    vi.advanceTimersByTime(ms * 3);
    expect(cb).toHaveBeenCalledTimes(3);
    clearInterval(id);
  });

  it("Off (ms === null) means no interval is registered", () => {
    const off = REFRESH_OPTIONS.find((o) => o.value === "off")!;
    expect(off.ms).toBeNull();
    // With null ms a caller simply doesn't register a timer.
  });

  it("replacing the interval stops the old one", () => {
    const cb = vi.fn();
    const ms = 30_000;
    const id1 = setInterval(cb, ms);
    clearInterval(id1);
    // After clearing, advancing by ms should NOT call cb again.
    vi.advanceTimersByTime(ms);
    expect(cb).not.toHaveBeenCalled();
  });
});
