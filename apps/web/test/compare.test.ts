import { StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
  COMPARE_PARAM,
  MAX_COMPARE,
  SERIES_COLORS,
  comparisonHref,
  parseSelection,
  selectionSearch,
  seriesColor,
  toggleSelection,
} from "../lib/compare";

const contract = (n: number) => StrKey.encodeContract(new Uint8Array(32).fill(n));

describe("parseSelection", () => {
  it("reads a comma separated selection and trims entries", () => {
    const params = new URLSearchParams(`${COMPARE_PARAM}=${contract(1)},${contract(2)}`);
    expect(parseSelection(params)).toEqual([contract(1), contract(2)]);
  });

  it("accepts repeated parameters", () => {
    const params = new URLSearchParams();
    params.append(COMPARE_PARAM, contract(3));
    params.append(COMPARE_PARAM, contract(4));
    expect(parseSelection(params)).toEqual([contract(3), contract(4)]);
  });

  it("drops invalid and duplicate contract ids", () => {
    const params = new URLSearchParams(
      `${COMPARE_PARAM}=not-a-contract,${contract(5)},${contract(5)}`,
    );
    expect(parseSelection(params)).toEqual([contract(5)]);
  });

  it("caps the selection at MAX_COMPARE", () => {
    const ids = Array.from({ length: MAX_COMPARE + 2 }, (_, i) => contract(i + 1));
    const params = new URLSearchParams(`${COMPARE_PARAM}=${ids.join(",")}`);
    expect(parseSelection(params)).toHaveLength(MAX_COMPARE);
    expect(parseSelection(params)).toEqual(ids.slice(0, MAX_COMPARE));
  });

  it("returns an empty list when the parameter is absent", () => {
    expect(parseSelection(new URLSearchParams())).toEqual([]);
  });

  it("can read another parameter name", () => {
    const params = new URLSearchParams(`sac=${contract(6)}`);
    expect(parseSelection(params, "sac")).toEqual([contract(6)]);
  });
});

describe("toggleSelection", () => {
  it("adds an asset that is not selected", () => {
    expect(toggleSelection([contract(1)], contract(2))).toEqual([contract(1), contract(2)]);
  });

  it("removes an asset that is selected", () => {
    expect(toggleSelection([contract(1), contract(2)], contract(1))).toEqual([contract(2)]);
  });

  it("refuses to add a sixth asset", () => {
    const full = Array.from({ length: MAX_COMPARE }, (_, i) => contract(i + 1));
    expect(toggleSelection(full, contract(9))).toEqual(full);
  });

  it("still allows removing from a full selection", () => {
    const full = Array.from({ length: MAX_COMPARE }, (_, i) => contract(i + 1));
    expect(toggleSelection(full, full[0] ?? "")).toHaveLength(MAX_COMPARE - 1);
  });
});

describe("selection URLs", () => {
  it("leaves the dashboard query empty when nothing is selected", () => {
    expect(selectionSearch([])).toBe("");
  });

  it("writes the dashboard query for a selection", () => {
    expect(selectionSearch([contract(1), contract(2)])).toBe(
      `?${COMPARE_PARAM}=${contract(1)},${contract(2)}`,
    );
  });

  it("builds the comparison page link", () => {
    expect(comparisonHref([contract(1), contract(2)])).toBe(
      `/compare/?sac=${contract(1)},${contract(2)}`,
    );
  });
});

describe("seriesColor", () => {
  it("uses a CSS variable from the palette", () => {
    expect(seriesColor(0)).toBe(`var(${SERIES_COLORS[0]})`);
    expect(seriesColor(MAX_COMPARE - 1)).toBe(`var(${SERIES_COLORS[MAX_COMPARE - 1]})`);
  });

  it("wraps around when there are more series than colours", () => {
    expect(seriesColor(MAX_COMPARE)).toBe(`var(${SERIES_COLORS[0]})`);
    expect(seriesColor(MAX_COMPARE + 2)).toBe(`var(${SERIES_COLORS[2]})`);
  });
});
