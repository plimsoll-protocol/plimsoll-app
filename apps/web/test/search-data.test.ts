import { beforeEach, describe, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({
  loadAssets: vi.fn(),
  loadReporters: vi.fn(),
}));

vi.mock("../lib/data", () => data);

import { loadSearchData, resetSearchData } from "../lib/search-data";

const asset = { sac: "CSAC", code: "PUSD", issuer: "GISSUER" };
const reporter = { address: "GREP", name: "Auditor One", role: "auditor" };

beforeEach(() => {
  resetSearchData();
  data.loadAssets.mockReset();
  data.loadReporters.mockReset();
});

describe("loadSearchData", () => {
  it("turns assets and reporters into search entries", async () => {
    data.loadAssets.mockResolvedValue([asset]);
    data.loadReporters.mockResolvedValue([reporter]);

    const result = await loadSearchData();

    expect(result.failed).toEqual([]);
    expect(result.entries.map((e) => `${e.kind}:${e.title}`)).toEqual([
      "asset:PUSD",
      "reporter:Auditor One",
    ]);
  });

  it("does not treat a missing indexer as a failure", async () => {
    data.loadAssets.mockResolvedValue([asset]);
    data.loadReporters.mockResolvedValue(null);

    const result = await loadSearchData();

    expect(result.failed).toEqual([]);
    expect(result.entries.map((e) => e.kind)).toEqual(["asset"]);
  });

  it("keeps the assets when the reporters cannot be read, and says so", async () => {
    data.loadAssets.mockResolvedValue([asset]);
    data.loadReporters.mockRejectedValue(new Error("indexer down"));

    const result = await loadSearchData();

    expect(result.failed).toEqual(["reporters"]);
    expect(result.entries.map((e) => e.title)).toEqual(["PUSD"]);
  });

  it("keeps the reporters when the assets cannot be read, and says so", async () => {
    data.loadAssets.mockRejectedValue(new Error("rpc down"));
    data.loadReporters.mockResolvedValue([reporter]);

    const result = await loadSearchData();

    expect(result.failed).toEqual(["assets"]);
    expect(result.entries.map((e) => e.title)).toEqual(["Auditor One"]);
  });

  it("reads once when it succeeds", async () => {
    data.loadAssets.mockResolvedValue([asset]);
    data.loadReporters.mockResolvedValue([]);

    await loadSearchData();
    await loadSearchData();

    expect(data.loadAssets).toHaveBeenCalledTimes(1);
    expect(data.loadReporters).toHaveBeenCalledTimes(1);
  });

  it("reads again after a failure, so reopening can recover", async () => {
    data.loadAssets.mockRejectedValueOnce(new Error("rpc down")).mockResolvedValue([asset]);
    data.loadReporters.mockResolvedValue([]);

    const first = await loadSearchData();
    // Let the failure clear the cache before asking again.
    await Promise.resolve();
    const second = await loadSearchData();

    expect(first.failed).toEqual(["assets"]);
    expect(second.failed).toEqual([]);
    expect(second.entries.map((e) => e.title)).toEqual(["PUSD"]);
  });
});
