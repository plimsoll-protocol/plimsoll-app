import { describe, expect, it } from "vitest";
import {
  HorizonError,
  checkStellarToml,
  fetchAssetRecord,
  findCurrency,
  supplyFromRecord,
  type HorizonAssetRecord,
} from "../src/index";
import { live } from "./live";

// Same figures as plimsoll-indexer/internal/horizon/supply_test.go, so the
// TypeScript and Go supply rules are pinned to the same answer.
const record: HorizonAssetRecord = {
  asset_code: "USDC",
  asset_issuer: "GISSUER",
  accounts: { authorized: 10 },
  balances: {
    authorized: "268509083.9282711",
    authorized_to_maintain_liabilities: "0.0000000",
    unauthorized: "1.5",
  },
  claimable_balances_amount: "25747.5652831",
  liquidity_pools_amount: "5329035.9202534",
  contracts_amount: "76649744.8499999",
  flags: { auth_required: false, auth_revocable: false, auth_immutable: false, auth_clawback_enabled: false },
};

describe("supplyFromRecord", () => {
  it("matches the Go indexer's total", () => {
    const s = supplyFromRecord(record);
    expect(s.total).toBe(3_505_136_137_638_075n);
    expect(s.unauthorized).toBe(15_000_000n);
    expect(s.contracts).toBe(766_497_448_499_999n);
  });

  it("treats missing buckets as zero", () => {
    const s = supplyFromRecord({ ...record, contracts_amount: "", claimable_balances_amount: "" });
    expect(s.contracts).toBe(0n);
    expect(s.total).toBe(3_505_136_137_638_075n - 766_497_448_499_999n - 257_475_652_831n);
  });
});

const toml = `
[DOCUMENTATION]
ORG_NAME = "Example Money"

[[CURRENCIES]]
code = "USDX"
issuer = "GOTHER"

[[CURRENCIES]]
code = "USDX"
issuer = "GREAL"
attestation_of_reserve = "https://example.money/reserves.pdf"
`;

describe("findCurrency", () => {
  it("confirms only the exact code and issuer", () => {
    const ok = findCurrency(toml, "USDX", "GREAL");
    expect(ok.status).toBe("confirmed");
    expect(ok.orgName).toBe("Example Money");
    expect(ok.currency?.attestation_of_reserve).toBe("https://example.money/reserves.pdf");
    expect(findCurrency(toml, "USDX", "GFAKE").status).toBe("not-listed");
    expect(findCurrency("not = = toml", "A", "B").status).toBe("invalid");
  });
});

const fake = (routes: Record<string, { status?: number; body: string }>): typeof fetch =>
  (async (url: string | URL | Request) => {
    const r = routes[String(url)];
    if (!r) throw new TypeError("Failed to fetch");
    return new Response(r.body, { status: r.status ?? 200 });
  }) as typeof fetch;

describe("network helpers", () => {
  it("checkStellarToml reports each failure mode", async () => {
    const f = fake({
      "https://ok.example/.well-known/stellar.toml": { body: toml },
      "https://gone.example/.well-known/stellar.toml": { status: 404, body: "" },
      "https://blocked.example/.well-known/stellar.toml": { status: 403, body: "" },
    });
    expect((await checkStellarToml("ok.example", "USDX", "GREAL", f)).status).toBe("confirmed");
    expect((await checkStellarToml("gone.example", "USDX", "GREAL", f)).status).toBe("not-found");
    expect((await checkStellarToml("blocked.example", "USDX", "GREAL", f)).status).toBe("unreachable");
    expect((await checkStellarToml("cors.example", "USDX", "GREAL", f)).status).toBe("unreachable");
    expect((await checkStellarToml("", "USDX", "GREAL", f)).status).toBe("no-domain");
  });

  it("fetchAssetRecord returns null for unknown assets", async () => {
    const f = fake({
      "https://h.example/assets?asset_code=NOPE&asset_issuer=GX": { body: '{"_embedded":{"records":[]}}' },
    });
    expect(await fetchAssetRecord("https://h.example/", "NOPE", "GX", f)).toBeNull();
  });

  // 404 is Horizon answering; 429 and 5xx are Horizon failing. Callers that
  // retry or degrade need to tell those apart.
  it("fetchAssetRecord reports the status and whether Horizon itself failed", async () => {
    const f = fake({
      "https://h.example/assets?asset_code=A&asset_issuer=G1": { status: 404, body: "" },
      "https://h.example/assets?asset_code=A&asset_issuer=G2": { status: 429, body: "" },
      "https://h.example/assets?asset_code=A&asset_issuer=G3": { status: 503, body: "" },
    });
    const statusOf = async (issuer: string) => {
      try {
        await fetchAssetRecord("https://h.example/", "A", issuer, f);
        return null;
      } catch (err) {
        expect(err).toBeInstanceOf(HorizonError);
        const e = err as HorizonError;
        return [e.status, e.isProviderFailure] as const;
      }
    };
    expect(await statusOf("G1")).toEqual([404, false]);
    expect(await statusOf("G2")).toEqual([429, true]);
    expect(await statusOf("G3")).toEqual([503, true]);
  });
});

// Reads mainnet Horizon. Run with PLIMSOLL_LIVE=1.
describe.skipIf(!process.env.PLIMSOLL_LIVE)("live mainnet", () => {
  it("reads Circle USDC supply on Stellar", async (ctx) => {
    const r = await live(ctx, () =>
      fetchAssetRecord(
        "https://horizon.stellar.org",
        "USDC",
        "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      ),
    );
    expect(r).not.toBeNull();
    // More than 100 million USDC circulate on Stellar.
    expect(supplyFromRecord(r!).total).toBeGreaterThan(100_000_000n * 10_000_000n);
  });
}, 60_000);
