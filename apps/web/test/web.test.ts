import { describe, expect, it } from "vitest";
import { SCRIPT_HASHES_TOKEN, buildCsp, originOf } from "../lib/csp";
import {
  CACHE_TTL_MS,
  assetsFromSearch,
  horizonMessage,
  readCache,
  searchFromAssets,
  unissuedWarning,
  validateAsset,
  writeCache,
} from "../lib/watch";
// @ts-expect-error plain JS module
import { TOKEN, applyHashes, inlineScriptHashes } from "../scripts/apply-csp.mjs";

const ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

describe("buildCsp", () => {
  const csp = buildCsp({
    endpoints: [
      "https://rpc.example/soroban",
      "https://horizon.example/",
      "https://indexer.example/v1",
      "",
      "https://horizon.example",
    ],
  });
  const directive = (name: string) =>
    csp
      .split("; ")
      .find((d) => d.startsWith(`${name} `))
      ?.split(" ")
      .slice(1);

  it("limits scripts to self plus the hash placeholder, never unsafe-inline", () => {
    expect(directive("script-src")).toEqual(["'self'", SCRIPT_HASHES_TOKEN]);
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
    expect(directive("style-src")).toEqual(["'self'"]);
  });

  it("derives connect-src from the configured endpoints, de-duplicated", () => {
    expect(directive("connect-src")).toEqual([
      "'self'",
      "https://rpc.example",
      "https://horizon.example",
      "https://indexer.example",
      "https:",
    ]);
  });

  it("blocks plugins and restricts base-uri", () => {
    expect(directive("object-src")).toEqual(["'none'"]);
    expect(directive("base-uri")).toEqual(["'self'"]);
    expect(directive("default-src")).toEqual(["'none'"]);
  });

  it("ignores non-URLs such as an indexer set to none", () => {
    expect(originOf("none")).toBeNull();
    expect(originOf("")).toBeNull();
    expect(originOf("http://localhost:8000/rpc")).toBe("http://localhost:8000");
  });
});

describe("inline script hashes", () => {
  const html = `<head><meta content="a ${TOKEN}"></head>
    <script src="/_next/a.js"></script>
    <script>self.__next_f=[]</script>
    <script id="x">self.__next_f.push([1,"y"])</script>
    <script>self.__next_f=[]</script>`;

  it("hashes each distinct inline script and skips external ones", () => {
    const h = inlineScriptHashes(html);
    expect(h).toHaveLength(2);
    expect(h.every((x: string) => /^'sha256-[A-Za-z0-9+/]{43}='$/.test(x))).toBe(true);
  });

  it("replaces the token with the hashes", () => {
    const out = applyHashes(html);
    expect(out).not.toContain(TOKEN);
    expect(out).toContain("content=\"a 'sha256-");
  });

  it("uses the same token as the policy", () => {
    expect(TOKEN).toBe(SCRIPT_HASHES_TOKEN);
  });
});

describe("validateAsset", () => {
  it("accepts a code and a valid issuer", () => {
    expect(validateAsset(" USDC ", ISSUER)).toEqual({
      ok: true,
      asset: { code: "USDC", issuer: ISSUER },
    });
  });

  it("rejects a bad issuer and a bad code with a message", () => {
    const badIssuer = validateAsset("USDC", ISSUER.slice(0, -1) + "A");
    expect(badIssuer.ok).toBe(false);
    expect(validateAsset("USDC", "nope").ok).toBe(false);
    expect(validateAsset("TOO-LONG-CODE!", ISSUER).ok).toBe(false);
    expect(validateAsset("", ISSUER).ok).toBe(false);
  });
});

describe("URL state", () => {
  it("round-trips custom assets and drops invalid or duplicate ones", () => {
    const assets = [{ code: "USDC", issuer: ISSUER }];
    const search = searchFromAssets(assets);
    expect(search).toBe(`?asset=USDC-${ISSUER}`);
    expect(assetsFromSearch(search)).toEqual(assets);
    expect(
      assetsFromSearch(`?asset=USDC-${ISSUER}&asset=USDC-${ISSUER}&asset=X-bad&asset=nodash`),
    ).toEqual(assets);
    expect(searchFromAssets([])).toBe("");
  });
});

describe("reading cache", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };

  it("returns a value within the window and nothing after it", () => {
    const store = memory();
    writeCache(store, "k", { n: 1 }, 1000);
    expect(readCache(store, "k", 1000 + CACHE_TTL_MS)).toEqual({ n: 1 });
    expect(readCache(store, "k", 1001 + CACHE_TTL_MS)).toBeNull();
    expect(readCache(store, "other", 1000)).toBeNull();
  });

  it("survives missing, full and corrupt storage", () => {
    expect(readCache(null, "k")).toBeNull();
    expect(() => writeCache(null, "k", 1)).not.toThrow();
    const full = {
      getItem: () => "{not json",
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(readCache(full, "k")).toBeNull();
    expect(() => writeCache(full, "k", 1)).not.toThrow();
  });
});

describe("horizonMessage", () => {
  it("names rate limiting specifically", () => {
    const limited = Object.assign(new Error("x: 429"), { isProviderFailure: true });
    expect(horizonMessage(limited)).toMatch(/rate limiting/);
    expect(horizonMessage(new Error("boom"))).toBe("Could not read Horizon: boom");
  });
});

describe("unissuedWarning", () => {
  it("warns only for a code the issuer has not issued", () => {
    expect(unissuedWarning("USDC", ["EURC", "USDC"])).toBeNull();
    expect(unissuedWarning("USDX", ["EURC", "USDC"])).toMatch(/has not issued USDX/);
    expect(unissuedWarning("USDX", [])).toMatch(/no assets/);
  });

  it("stays quiet when Horizon could not be read or nothing is typed", () => {
    expect(unissuedWarning("USDX", null)).toBeNull();
    expect(unissuedWarning("", ["USDC"])).toBeNull();
  });
});
