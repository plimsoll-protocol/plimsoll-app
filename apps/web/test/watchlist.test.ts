import { describe, it, expect, beforeEach } from "vitest";
import {
  addWatch,
  isWatching,
  listWatched,
  removeWatch,
  notifyIfUnder,
  notificationPermission,
} from "../lib/watchlist";

// A minimal in-memory localStorage stand-in
function makeStore(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
}

beforeEach(() => {
  // Replace localStorage with a fresh in-memory store for each test.
  const store = makeStore();
  Object.defineProperty(globalThis, "localStorage", {
    value: store,
    writable: true,
    configurable: true,
  });
});

describe("watchlist storage", () => {
  it("starts empty", () => {
    expect(listWatched()).toEqual([]);
  });

  it("isWatching returns false for unknown sac", () => {
    expect(isWatching("CAAA")).toBe(false);
  });

  it("addWatch and isWatching", () => {
    addWatch({ sac: "CAAA", code: "USD", thresholdBps: 10_000 });
    expect(isWatching("CAAA")).toBe(true);
  });

  it("removeWatch", () => {
    addWatch({ sac: "CAAA", code: "USD", thresholdBps: 10_000 });
    removeWatch("CAAA");
    expect(isWatching("CAAA")).toBe(false);
  });

  it("addWatch replaces existing entry for same sac", () => {
    addWatch({ sac: "CAAA", code: "USD", thresholdBps: 10_000 });
    addWatch({ sac: "CAAA", code: "USD", thresholdBps: 9_000 });
    const list = listWatched();
    expect(list.length).toBe(1);
    expect(list[0]?.thresholdBps).toBe(9_000);
  });

  it("addWatch sets addedAt timestamp", () => {
    const before = Date.now();
    addWatch({ sac: "CAAA", code: "USD", thresholdBps: 10_000 });
    const after = Date.now();
    const entry = listWatched()[0];
    expect(entry?.addedAt).toBeGreaterThanOrEqual(before);
    expect(entry?.addedAt).toBeLessThanOrEqual(after);
  });

  it("stores multiple assets independently", () => {
    addWatch({ sac: "CAAA", code: "USD", thresholdBps: 10_000 });
    addWatch({ sac: "CBBB", code: "EUR", thresholdBps: 10_000 });
    expect(listWatched().length).toBe(2);
    expect(isWatching("CAAA")).toBe(true);
    expect(isWatching("CBBB")).toBe(true);
    removeWatch("CAAA");
    expect(isWatching("CAAA")).toBe(false);
    expect(isWatching("CBBB")).toBe(true);
  });
});

describe("notifyIfUnder", () => {
  it("does nothing when Notification is unavailable", () => {
    // jsdom does not define Notification by default; just ensure no throw.
    expect(() => notifyIfUnder("CAAA", "USD", 9_000, "under")).not.toThrow();
  });

  it("notificationPermission returns unavailable when Notification is not defined", () => {
    expect(notificationPermission()).toBe("unavailable");
  });
});
