import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexerClient, PlimsollContracts, TESTNET } from "@plimsoll/sdk";
import { config } from "../lib/config";
import { exposePlimsollDebug, trackSdkCalls } from "../lib/debug";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("development SDK debug object", () => {
  it("exposes the clients and updates lastResponse after SDK calls", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("window", {});

    const contracts = trackSdkCalls(new PlimsollContracts(TESTNET), "contracts");
    const indexer = trackSdkCalls(new IndexerClient("https://indexer.example"), "indexer");
    exposePlimsollDebug({ contracts, indexer }, config);

    vi.spyOn(contracts, "getAsset").mockResolvedValue(null);
    await contracts.getAsset("CSAC");

    expect(window.__plimsoll__?.sdk.contracts).toBe(contracts);
    expect(window.__plimsoll__?.sdk.indexer).toBe(indexer);
    expect(window.__plimsoll__?.config).toBe(config);
    expect(window.__plimsoll__?.lastResponse).toMatchObject({
      client: "contracts",
      method: "getAsset",
      args: ["CSAC"],
      response: null,
    });

    vi.spyOn(indexer, "listAssets").mockResolvedValue([]);
    await indexer.listAssets();
    expect(window.__plimsoll__?.lastResponse).toMatchObject({
      client: "indexer",
      method: "listAssets",
      response: [],
    });
  });

  it("records rejected calls and does not attach outside development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("window", {});
    const contracts = trackSdkCalls(new PlimsollContracts(TESTNET), "contracts");
    exposePlimsollDebug({ contracts, indexer: null }, config);

    const failure = new Error("RPC unavailable");
    vi.spyOn(contracts, "getAsset").mockRejectedValue(failure);
    await expect(contracts.getAsset("CSAC")).rejects.toBe(failure);
    expect(window.__plimsoll__?.lastResponse).toMatchObject({
      client: "contracts",
      method: "getAsset",
      error: failure,
    });

    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("window", {});
    exposePlimsollDebug({ contracts, indexer: null }, config);
    expect(window.__plimsoll__).toBeUndefined();
  });
});
