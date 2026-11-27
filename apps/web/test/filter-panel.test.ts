import { describe, expect, it } from "vitest";
import {
  FILTER_PANEL_STORAGE_KEY,
  defaultPanelOpen,
  parsePanelPreference,
  readPanelPreference,
  writePanelPreference,
} from "../lib/filter-panel";

const memory = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};

describe("parsePanelPreference", () => {
  it("accepts only the two stored booleans", () => {
    expect(parsePanelPreference("true")).toBe(true);
    expect(parsePanelPreference("false")).toBe(false);
    expect(parsePanelPreference("")).toBeNull();
    expect(parsePanelPreference("1")).toBeNull();
    expect(parsePanelPreference(null)).toBeNull();
  });
});

describe("readPanelPreference", () => {
  it("reads the stored value under the panel key", () => {
    expect(readPanelPreference(memory({ [FILTER_PANEL_STORAGE_KEY]: "false" }))).toBe(false);
    expect(readPanelPreference(memory({ [FILTER_PANEL_STORAGE_KEY]: "true" }))).toBe(true);
    expect(readPanelPreference(memory())).toBeNull();
  });

  it("survives missing or throwing storage", () => {
    expect(readPanelPreference(null)).toBeNull();
    expect(
      readPanelPreference({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBeNull();
  });
});

describe("writePanelPreference", () => {
  it("stores the choice as a string", () => {
    const store = memory();
    writePanelPreference(store, false);
    expect(store.values.get(FILTER_PANEL_STORAGE_KEY)).toBe("false");
    writePanelPreference(store, true);
    expect(store.values.get(FILTER_PANEL_STORAGE_KEY)).toBe("true");
  });

  it("does not throw when storage is absent or full", () => {
    expect(() => writePanelPreference(null, true)).not.toThrow();
    expect(() =>
      writePanelPreference(
        {
          setItem: () => {
            throw new Error("QuotaExceededError");
          },
        },
        true,
      ),
    ).not.toThrow();
  });
});

describe("defaultPanelOpen", () => {
  it("opens on desktop and closes on mobile", () => {
    expect(defaultPanelOpen(true)).toBe(true);
    expect(defaultPanelOpen(false)).toBe(false);
  });
});
