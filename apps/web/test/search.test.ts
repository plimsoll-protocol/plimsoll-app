import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexerReporter } from "@plimsoll/sdk";
import {
  DOC_ENTRIES,
  DOCS_BASE_URL,
  MAX_RESULTS,
  PAGE_ENTRIES,
  SEARCH_DEBOUNCE_MS,
  assetEntries,
  createDebouncer,
  isSearchShortcut,
  nextActiveIndex,
  normalize,
  reporterEntries,
  searchEntries,
  type KeyLike,
  type SearchEntry,
} from "../lib/search";

const SAC_PUSD = "CCHPT4TEJDPZQDSUVW3NP6A35ROGV4WEFZKT45SKWYCFZSUB7R5HIM7S";
const ISSUER_PUSD = "GBIE3ANCRVCBWETUZXWYKRMP27LQVJHX757XXAQUT3LYHVTNFPPPXEY4";

const assets = assetEntries([
  { sac: SAC_PUSD, code: "PUSD", issuer: ISSUER_PUSD },
  {
    sac: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    code: "USDC",
    issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  },
  {
    sac: "CBSQEFG73RMUVEZ56EFEBCJ23WZNF6FFYXEAJKYG6SZCLKDZ5B2YXGHS",
    code: "QUSD",
    issuer: "GCCMGQ3UGITN2HUUSQKTDMBFZ34QQTKMODR56NT26JMPH2MHVYWZMXNE",
  },
]);

function reporter(over: Partial<IndexerReporter>): IndexerReporter {
  return {
    address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    name: "Reporter",
    role: "auditor",
    ...over,
  } as IndexerReporter;
}

const reporters = reporterEntries([
  reporter({
    name: "Ledger Audit Co",
    role: "auditor",
    address: "GAUDITOR0000000000000000000000000000000000000000000000AB",
  }),
  reporter({
    name: "Pat Transcriber",
    role: "transcriber",
    address: "GTRANSCR0000000000000000000000000000000000000000000000AB",
  }),
  reporter({
    name: "Supply Bot",
    role: "supply_poster",
    address: "GSUPPLY00000000000000000000000000000000000000000000000AB",
  }),
]);

const everything: SearchEntry[] = [...assets, ...reporters, ...PAGE_ENTRIES, ...DOC_ENTRIES];
const titles = (list: readonly SearchEntry[]) => list.map((e) => e.title);

describe("what can be searched", () => {
  it("gives every entry a unique id", () => {
    const ids = everything.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("links an asset to its page by SAC", () => {
    const pusd = assets.find((e) => e.title === "PUSD");
    expect(pusd?.href).toBe(`/asset/?sac=${SAC_PUSD}`);
    expect(pusd?.external).toBe(false);
    expect(pusd?.kind).toBe("asset");
  });

  it("links a reporter to the reporters page and says which role it holds", () => {
    const auditor = reporters.find((e) => e.title === "Ledger Audit Co");
    expect(auditor?.href).toBe("/reporters/");
    expect(auditor?.detail).toContain("Auditor");
    expect(reporters.find((e) => e.title === "Supply Bot")?.detail).toContain("Supply poster");
  });

  it("opens documentation pages on the docs site, outside the app", () => {
    expect(DOC_ENTRIES.length).toBeGreaterThan(10);
    for (const entry of DOC_ENTRIES) {
      expect(entry.external).toBe(true);
      expect(entry.href.startsWith(DOCS_BASE_URL)).toBe(true);
    }
    expect(DOC_ENTRIES.find((e) => e.title === "TypeScript SDK")?.href).toBe(
      `${DOCS_BASE_URL}/developers/sdk`,
    );
  });

  it("keeps the app's own pages internal", () => {
    for (const entry of PAGE_ENTRIES) {
      expect(entry.external).toBe(false);
      expect(entry.href.startsWith("/")).toBe(true);
    }
  });

  it("does not put the asset name into an href unescaped", () => {
    const [entry] = assetEntries([{ sac: "C&x=1 y", code: "X", issuer: "G" }]);
    expect(entry?.href).toBe("/asset/?sac=C%26x%3D1%20y");
  });
});

describe("normalize", () => {
  it("lower-cases, trims and folds accents", () => {
    expect(normalize("  Café  ")).toBe("cafe");
    expect(normalize("USDC")).toBe("usdc");
  });
});

describe("searchEntries", () => {
  it("shows the app's pages when nothing is typed", () => {
    expect(searchEntries(everything, "")).toEqual([...PAGE_ENTRIES]);
    expect(searchEntries(everything, "   ")).toEqual([...PAGE_ENTRIES]);
  });

  it("finds an asset by code, ignoring case", () => {
    expect(titles(searchEntries(everything, "pusd"))[0]).toBe("PUSD");
    expect(titles(searchEntries(everything, "UsDc"))[0]).toBe("USDC");
  });

  it("ranks an exact code above a partial one", () => {
    // "usd" is inside PUSD, USDC and QUSD, but it starts only USDC.
    const found = titles(searchEntries(everything, "usd")).filter((t) => /usd/i.test(t));
    expect(found[0]).toBe("USDC");
    expect(found).toEqual(expect.arrayContaining(["PUSD", "QUSD"]));
  });

  it("finds an asset by its SAC address or its issuer", () => {
    expect(titles(searchEntries(everything, SAC_PUSD))).toEqual(["PUSD"]);
    expect(titles(searchEntries(everything, ISSUER_PUSD.slice(0, 12)))).toEqual(["PUSD"]);
  });

  it("finds a reporter by name, and by role", () => {
    expect(titles(searchEntries(everything, "ledger audit"))[0]).toBe("Ledger Audit Co");
    expect(titles(searchEntries(everything, "transcriber"))).toContain("Pat Transcriber");
    expect(titles(searchEntries(everything, "supply poster"))).toContain("Supply Bot");
  });

  it("finds a page and a doc by title", () => {
    expect(searchEntries(everything, "mainnet watch").map((e) => e.kind)).toEqual(
      expect.arrayContaining(["page", "doc"]),
    );
    expect(titles(searchEntries(everything, "trust model"))).toEqual(["Trust model"]);
  });

  it("finds a page by a word that is not in its title", () => {
    expect(titles(searchEntries(everything, "webhook"))).toContain("Alert settings");
  });

  it("requires every word of the query to match", () => {
    expect(searchEntries(everything, "pusd banana")).toEqual([]);
    expect(titles(searchEntries(everything, "coverage ledger"))).toContain("coverage-ledger");
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(searchEntries(everything, "zzzzqqqq")).toEqual([]);
  });

  it("ranks an entry whose title starts with the word above one that only contains it", () => {
    const list = searchEntries(everything, "report");
    const first = list[0]?.title ?? "";
    expect(first.toLowerCase().startsWith("report")).toBe(true);
  });

  it("orders ties by kind, so assets come before docs", () => {
    const entries: SearchEntry[] = [
      { id: "d", kind: "doc", title: "Alpha", detail: "", href: "x", external: true, terms: [] },
      { id: "a", kind: "asset", title: "Alpha", detail: "", href: "y", external: false, terms: [] },
    ];
    expect(searchEntries(entries, "alpha").map((e) => e.kind)).toEqual(["asset", "doc"]);
  });

  it("caps the list", () => {
    const many: SearchEntry[] = Array.from({ length: 50 }, (_, i) => ({
      id: `p${i}`,
      kind: "page",
      title: `Item ${String(i).padStart(2, "0")}`,
      detail: "",
      href: `/${i}/`,
      external: false,
      terms: [],
    }));
    expect(searchEntries(many, "item")).toHaveLength(MAX_RESULTS);
    expect(searchEntries(many, "item", 5)).toHaveLength(5);
  });

  it("does not change what it is given", () => {
    const copy = structuredClone(everything);
    searchEntries(everything, "pusd");
    expect(everything).toEqual(copy);
  });

  it("treats regex characters in the query as plain text", () => {
    expect(() => searchEntries(everything, "(.*[")).not.toThrow();
    expect(searchEntries(everything, "(.*[")).toEqual([]);
  });
});

describe("isSearchShortcut", () => {
  const key = (over: Partial<KeyLike>): KeyLike => ({
    key: "k",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...over,
  });

  it("accepts CMD+K and CTRL+K", () => {
    expect(isSearchShortcut(key({ metaKey: true }))).toBe(true);
    expect(isSearchShortcut(key({ ctrlKey: true }))).toBe(true);
    expect(isSearchShortcut(key({ ctrlKey: true, key: "K" }))).toBe(true);
  });

  it("ignores a bare K, other keys and other chords", () => {
    expect(isSearchShortcut(key({}))).toBe(false);
    expect(isSearchShortcut(key({ ctrlKey: true, key: "j" }))).toBe(false);
    expect(isSearchShortcut(key({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isSearchShortcut(key({ metaKey: true, altKey: true }))).toBe(false);
  });
});

describe("nextActiveIndex", () => {
  it("moves down and up by one", () => {
    expect(nextActiveIndex(0, 5, "ArrowDown")).toBe(1);
    expect(nextActiveIndex(3, 5, "ArrowUp")).toBe(2);
  });

  it("wraps at both ends", () => {
    expect(nextActiveIndex(4, 5, "ArrowDown")).toBe(0);
    expect(nextActiveIndex(0, 5, "ArrowUp")).toBe(4);
  });

  it("jumps with Home and End", () => {
    expect(nextActiveIndex(3, 5, "Home")).toBe(0);
    expect(nextActiveIndex(1, 5, "End")).toBe(4);
  });

  it("has nothing to highlight when the list is empty", () => {
    for (const k of ["ArrowDown", "ArrowUp", "Home", "End"]) {
      expect(nextActiveIndex(0, 0, k)).toBe(-1);
    }
  });

  it("leaves every other key to the field", () => {
    for (const k of ["a", "Enter", "Escape", "Tab", "ArrowLeft", "ArrowRight", " "]) {
      expect(nextActiveIndex(0, 5, k)).toBeNull();
    }
  });
});

describe("createDebouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits 150 ms after the last call", () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(150);
    const fn = vi.fn();
    const d = createDebouncer(fn, SEARCH_DEBOUNCE_MS);

    d.call("p");
    vi.advanceTimersByTime(149);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledExactlyOnceWith("p");
  });

  it("runs once, with the last value, when calls arrive faster than the delay", () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, SEARCH_DEBOUNCE_MS);

    d.call("p");
    vi.advanceTimersByTime(100);
    d.call("pu");
    vi.advanceTimersByTime(100);
    d.call("pus");
    vi.advanceTimersByTime(149);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(fn).toHaveBeenCalledExactlyOnceWith("pus");
  });

  it("runs again for a call made after the delay", () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, SEARCH_DEBOUNCE_MS);

    d.call("a");
    vi.advanceTimersByTime(150);
    d.call("b");
    vi.advanceTimersByTime(150);

    expect(fn.mock.calls).toEqual([["a"], ["b"]]);
  });

  it("drops a waiting call when cancelled", () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, SEARCH_DEBOUNCE_MS);

    d.call("a");
    d.cancel();
    vi.advanceTimersByTime(1000);

    expect(fn).not.toHaveBeenCalled();
  });
});
