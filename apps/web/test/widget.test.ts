import { TESTNET } from "@plimsoll/sdk";
import { StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { MAX_WIDGET_ASSETS, parseWidgetAssets } from "../lib/widget";

const pusd = TESTNET.assets.PUSD;
const qusd = TESTNET.assets.QUSD;
if (!pusd || !qusd) throw new Error("Missing test fixture");

describe("parseWidgetAssets", () => {
  it("accepts repeated addresses, trims whitespace, and removes duplicates", () => {
    expect(parseWidgetAssets([` ${pusd.sac} `, qusd.sac, pusd.sac])).toEqual({
      assets: [pusd.sac, qusd.sac],
      invalidCount: 0,
      overflowCount: 0,
    });
  });

  it("ignores invalid and empty addresses", () => {
    expect(parseWidgetAssets(["", "not-a-contract", pusd.sac])).toEqual({
      assets: [pusd.sac],
      invalidCount: 1,
      overflowCount: 0,
    });
  });

  it("limits the watchlist to a bounded number of valid addresses", () => {
    const assets = Array.from({ length: MAX_WIDGET_ASSETS + 1 }, (_, index) =>
      StrKey.encodeContract(Buffer.alloc(32, index + 1)),
    );

    const parsed = parseWidgetAssets(assets);

    expect(parsed.assets).toHaveLength(MAX_WIDGET_ASSETS);
    expect(parsed.overflowCount).toBe(1);
    expect(parsed.invalidCount).toBe(0);
  });
});
