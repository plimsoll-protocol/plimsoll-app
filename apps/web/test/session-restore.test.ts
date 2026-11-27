import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attemptRestore,
  clearLastAsset,
  getLastAsset,
  setLastAsset,
} from "../lib/session";

function makeSessionStore(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

beforeEach(() => {
  // Replace sessionStorage with a fresh in-memory store for each test.
  const store = makeSessionStore();
  Object.defineProperty(globalThis, "window", {
    value: { sessionStorage: store },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, "window", {
    value: undefined,
    writable: true,
    configurable: true,
  });
});

describe("session storage", () => {
  it("getLastAsset returns null when nothing is stored", () => {
    expect(getLastAsset()).toBeNull();
  });

  it("setLastAsset then getLastAsset round-trips the sac address", () => {
    setLastAsset("CAAA");
    expect(getLastAsset()).toBe("CAAA");
  });

  it("setLastAsset replaces the previously stored address", () => {
    setLastAsset("CAAA");
    setLastAsset("CBBB");
    expect(getLastAsset()).toBe("CBBB");
  });

  it("clearLastAsset removes the stored address", () => {
    setLastAsset("CAAA");
    clearLastAsset();
    expect(getLastAsset()).toBeNull();
  });

  it("storage access failures do not crash", () => {
    const store = new Proxy({} as Storage, {
      get() {
        throw new Error("storage unavailable");
      },
    });
    Object.defineProperty(globalThis, "window", {
      value: { sessionStorage: store },
      writable: true,
      configurable: true,
    });
    expect(getLastAsset()).toBeNull();
    expect(() => setLastAsset("CAAA")).not.toThrow();
    expect(() => clearLastAsset()).not.toThrow();
  });
});

describe("attemptRestore", () => {
  it("navigates to the stored asset when it still exists", async () => {
    const loadAsset = vi.fn().mockResolvedValue({ sac: "CAAA" });
    const navigate = vi.fn();
    await attemptRestore({
      getStored: () => "CAAA",
      clearStored: vi.fn(),
      loadAsset,
      navigate,
    });
    expect(loadAsset).toHaveBeenCalledTimes(1);
    expect(loadAsset).toHaveBeenCalledWith("CAAA");
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("CAAA");
  });

  it("does not navigate and clears the stored value when the asset is gone", async () => {
    const loadAsset = vi.fn().mockResolvedValue(null);
    const clearStored = vi.fn();
    const navigate = vi.fn();
    await attemptRestore({
      getStored: () => "CAAA",
      clearStored,
      loadAsset,
      navigate,
    });
    expect(loadAsset).toHaveBeenCalledWith("CAAA");
    expect(clearStored).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does nothing when there is no stored asset", async () => {
    const loadAsset = vi.fn();
    const navigate = vi.fn();
    await attemptRestore({
      getStored: () => null,
      clearStored: vi.fn(),
      loadAsset,
      navigate,
    });
    expect(loadAsset).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps the stored value on a temporary load failure", async () => {
    const clearStored = vi.fn();
    const navigate = vi.fn();
    await attemptRestore({
      getStored: () => "CAAA",
      clearStored,
      loadAsset: vi.fn().mockRejectedValue(new Error("network down")),
      navigate,
    });
    expect(clearStored).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
