import { afterEach, describe, expect, it, vi } from "vitest";
import { Networks } from "@stellar/stellar-sdk";
import { EXTERNAL_REL, config, explorer, stellarExpertUrl } from "../lib/config";

describe("stellarExpertUrl", () => {
  it("picks the Stellar Expert network from the passphrase", () => {
    expect(stellarExpertUrl(Networks.PUBLIC)).toBe("https://stellar.expert/explorer/public");
    expect(stellarExpertUrl(Networks.TESTNET)).toBe("https://stellar.expert/explorer/testnet");
    expect(stellarExpertUrl(Networks.FUTURENET)).toBe("https://stellar.expert/explorer/futurenet");
  });

  it("returns null for a network Stellar Expert does not index", () => {
    expect(stellarExpertUrl(Networks.STANDALONE)).toBeNull();
    expect(stellarExpertUrl("")).toBeNull();
  });
});

describe("explorer links", () => {
  it("default to the testnet explorer for the default testnet build", () => {
    expect(config.explorerUrl).toBe("https://stellar.expert/explorer/testnet");
    expect(explorer.contract("CA")).toBe("https://stellar.expert/explorer/testnet/contract/CA");
    expect(explorer.account("GA")).toBe("https://stellar.expert/explorer/testnet/account/GA");
  });

  it("open without giving the new tab a window.opener", () => {
    expect(EXTERNAL_REL.split(" ")).toContain("noopener");
  });
});

describe("explorer for the configured network", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("switches to the mainnet explorer for a mainnet build", async () => {
    vi.stubEnv("NEXT_PUBLIC_NETWORK_PASSPHRASE", Networks.PUBLIC);
    vi.resetModules();
    const mod = await import("../lib/config");
    expect(mod.explorer.contract("CA")).toBe("https://stellar.expert/explorer/public/contract/CA");
  });

  it("lets NEXT_PUBLIC_EXPLORER_URL override the default", async () => {
    vi.stubEnv("NEXT_PUBLIC_NETWORK_PASSPHRASE", Networks.PUBLIC);
    vi.stubEnv("NEXT_PUBLIC_EXPLORER_URL", "https://explorer.example/");
    vi.resetModules();
    const mod = await import("../lib/config");
    expect(mod.explorer.account("GA")).toBe("https://explorer.example/account/GA");
  });
});
