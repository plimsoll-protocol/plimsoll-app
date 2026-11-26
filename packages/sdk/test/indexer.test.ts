import { describe, expect, it, vi } from "vitest";
import { IndexerAbortError, IndexerClient } from "../src/index";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A fetch that never answers but honours the abort signal. */
const hanging: typeof fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("aborted", "AbortError")),
    );
  });

describe("IndexerClient options", () => {
  it("health() calls /healthz and returns typed health data", async () => {
    const f = vi.fn(async () => json({ status: "ok", ingested_to_ledger: 5034661 }));
    const c = new IndexerClient("http://x/", f as unknown as typeof fetch);
    const health = await c.health();
    expect(health).toEqual({ status: "ok", ingested_to_ledger: 5034661 });
    expect((f.mock.calls[0] as unknown[])[0]).toBe("http://x/healthz");
  });

  it("health() returns typed lagging status with lag_seconds and last_event_at", async () => {
    const laggingPayload = {
      status: "lagging",
      lag_seconds: 300,
      last_event_at: "2026-01-01T00:00:00Z",
      latest_ledger: 5035000,
      ingested_to_ledger: 5034000,
    };
    const f = vi.fn(async () => json(laggingPayload));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    const health = await c.health();
    expect(health.status).toBe("lagging");
    expect(health.lag_seconds).toBe(300);
    expect(health.last_event_at).toBe("2026-01-01T00:00:00Z");
  });

  it("health() throws IndexerError when server returns 503", async () => {
    const f = vi.fn(async () => json({ error: "database down" }, 503));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    await expect(c.health()).rejects.toMatchObject({ name: "IndexerError", status: 503 });
  });

  it("sets no signal by default", async () => {
    const f = vi.fn(async () => json({ reporters: [] }));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    await c.reporters();
    expect((f.mock.calls[0] as unknown as [unknown, RequestInit?])[1]?.signal).toBeUndefined();
  });

  it("rejects with IndexerAbortError when aborted", async () => {
    const c = new IndexerClient("http://x", hanging);
    const ctl = new AbortController();
    const p = c.network({ signal: ctl.signal });
    ctl.abort();
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IndexerAbortError);
    expect((err as IndexerAbortError).reason).toBe("aborted");
  });

  it("rejects when already aborted", async () => {
    const c = new IndexerClient("http://x", hanging);
    const err = await c.health({ signal: AbortSignal.abort() }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IndexerAbortError);
  });

  it("per-request timeout", async () => {
    const c = new IndexerClient("http://x", hanging);
    const err = await c.listAssets(1, { timeoutMs: 10 }).catch((e: unknown) => e);
    expect((err as IndexerAbortError).reason).toBe("timeout");
  });

  it("constructor default timeout, overridable per request", async () => {
    const c = new IndexerClient("http://x", hanging, 10);
    const err = await c.getAsset("C1").catch((e: unknown) => e);
    expect((err as IndexerAbortError).reason).toBe("timeout");
    const f = vi.fn(async () => json({ status: "ok" }));
    const c2 = new IndexerClient("http://x", f as unknown as typeof fetch, 10);
    await expect(c2.health({ timeoutMs: 1000 })).resolves.toEqual({ status: "ok" });
  });

  it("leaves other errors unchanged", async () => {
    const f = async () => json({ error: "nope" }, 404);
    const c = new IndexerClient("http://x", f as unknown as typeof fetch, 1000);
    await expect(c.network()).rejects.toMatchObject({ name: "IndexerError", status: 404 });
  });
});

describe("IndexerClient webhook methods", () => {
  const WEBHOOK = {
    id: "wh1",
    url: "https://example.com/hook",
    threshold_bps: 10000,
    sac: null,
    created_at: "2026-01-01T00:00:00Z",
  };

  it("registerWebhook POSTs to /v1/webhooks and returns the webhook", async () => {
    const f = vi.fn(async () => json(WEBHOOK));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    const result = await c.registerWebhook({
      url: "https://example.com/hook",
      threshold_bps: 10000,
    });
    expect(result).toEqual(WEBHOOK);
    const call = f.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("http://x/v1/webhooks");
    expect(call[1]?.method).toBe("POST");
    expect(JSON.parse(call[1]?.body as string)).toMatchObject({
      url: "https://example.com/hook",
      threshold_bps: 10000,
    });
  });

  it("listWebhooks GETs /v1/webhooks and returns the array", async () => {
    const f = vi.fn(async () => json({ webhooks: [WEBHOOK] }));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    const result = await c.listWebhooks();
    expect(result).toEqual([WEBHOOK]);
    expect((f.mock.calls[0] as [string])[0]).toBe("http://x/v1/webhooks");
  });

  it("deleteWebhook DELETEs /v1/webhooks/:id", async () => {
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    await c.deleteWebhook("wh1");
    const call = f.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("http://x/v1/webhooks/wh1");
    expect(call[1]?.method).toBe("DELETE");
  });

  it("deleteWebhook throws IndexerError on non-ok response", async () => {
    const f = async () => json({ error: "not found" }, 404);
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    await expect(c.deleteWebhook("bad")).rejects.toMatchObject({
      name: "IndexerError",
      status: 404,
    });
  });
});

describe("IndexerClient batchCoverageStatus", () => {
  const makeCoverage = (
    bps: number | null,
    reportAge: number,
    supplyAge: number,
  ) => ({
    bps,
    ratio: bps != null ? String(bps / 10000) : null,
    tier: "issuer_signed" as const,
    supply: "1000000",
    reserves: "1000000",
    supply_ledger: 100,
    supply_posted_at: new Date().toISOString(),
    report_as_of: new Date().toISOString(),
    report_age_seconds: reportAge,
    supply_age_seconds: supplyAge,
    reporter: "GABC",
    doc_uri: "https://example.com",
  });

  const makeAsset = (
    sac: string,
    bps: number | null,
    reportAge = 60,
    supplyAge = 60,
  ) => ({
    sac,
    code: "TEST",
    issuer: "GABC",
    listed_ledger: 1,
    listed_at: new Date().toISOString(),
    toml: null,
    supply: null,
    reports: {},
    coverage: makeCoverage(bps, reportAge, supplyAge),
  });

  it("returns covered for bps >= 10000 and fresh ages", async () => {
    const f = vi.fn(async () =>
      json(makeAsset("CAAA", 10_000)),
    );
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    const result = await c.batchCoverageStatus(["CAAA"]);
    expect(result.get("CAAA")).toBe("covered");
  });

  it("returns under for bps < 10000 and fresh ages", async () => {
    const f = vi.fn(async () => json(makeAsset("CAAA", 9_999)));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    const result = await c.batchCoverageStatus(["CAAA"]);
    expect(result.get("CAAA")).toBe("under");
  });

  it("returns stale when report age exceeds maxAgeSeconds", async () => {
    const week = 7 * 24 * 3600;
    const f = vi.fn(async () => json(makeAsset("CAAA", 10_000, week + 1, 60)));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    const result = await c.batchCoverageStatus(["CAAA"]);
    expect(result.get("CAAA")).toBe("stale");
  });

  it("returns stale when supply age exceeds maxAgeSeconds", async () => {
    const week = 7 * 24 * 3600;
    const f = vi.fn(async () => json(makeAsset("CAAA", 10_000, 60, week + 1)));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    const result = await c.batchCoverageStatus(["CAAA"]);
    expect(result.get("CAAA")).toBe("stale");
  });

  it("returns unknown on fetch failure", async () => {
    const f = vi.fn(async () => json({ error: "not found" }, 404));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    const result = await c.batchCoverageStatus(["CAAA"]);
    expect(result.get("CAAA")).toBe("unknown");
  });

  it("returns unknown when coverage is null", async () => {
    const asset = { ...makeAsset("CAAA", 10_000), coverage: null };
    const f = vi.fn(async () => json(asset));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    const result = await c.batchCoverageStatus(["CAAA"]);
    expect(result.get("CAAA")).toBe("unknown");
  });

  it("fans out to individual getAsset calls and returns a map", async () => {
    let callCount = 0;
    const f = vi.fn(async (url: unknown) => {
      callCount++;
      const sac = String(url).split("/").pop()?.split("?")[0] ?? "";
      return json(makeAsset(sac, callCount === 1 ? 10_000 : 9_999));
    });
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    const result = await c.batchCoverageStatus(["CAAA", "CBBB"]);
    expect(result.size).toBe(2);
    expect(result.has("CAAA")).toBe(true);
    expect(result.has("CBBB")).toBe(true);
  });

  it("respects custom maxAgeSeconds", async () => {
    const tenDays = 10 * 24 * 3600;
    const f = vi.fn(async () =>
      json(makeAsset("CAAA", 10_000, tenDays - 1, 60)),
    );
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    const strictResult = await c.batchCoverageStatus(["CAAA"]);
    expect(strictResult.get("CAAA")).toBe("stale");
    const laxResult = await c.batchCoverageStatus(["CAAA"], {
      maxAgeSeconds: tenDays,
    });
    expect(laxResult.get("CAAA")).toBe("covered");
  });
});

describe("IndexerClient.reporterReports", () => {
  const REPORT = {
    sac: "CA",
    tier: "auditor_signed",
    amount: "100",
    as_of: "2026-01-01T00:00:00Z",
    posted_at: "2026-01-02T00:00:00Z",
    reporter: "GA",
    doc_hash: "00",
    doc_uri: "https://example.com/r.pdf",
    tx_hash: "ab",
  };

  it("calls the reporter reports endpoint and maps next_before", async () => {
    const f = vi.fn(async () => json({ reports: [REPORT], next_before: 41 }));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    await expect(c.reporterReports("GA")).resolves.toEqual({ reports: [REPORT], nextBefore: 41 });
    expect((f.mock.calls[0] as unknown[])[0]).toBe("http://x/v1/reporters/GA/reports");
  });

  it("sends limit, before and asset as query parameters", async () => {
    const f = vi.fn(async () => json({ reports: [] }));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    await c.reporterReports("G A", { limit: 50, before: 90, asset: "CB" });
    expect((f.mock.calls[0] as unknown[])[0]).toBe(
      "http://x/v1/reporters/G%20A/reports?limit=50&before=90&asset=CB",
    );
  });

  it("reports the last page as nextBefore null", async () => {
    const f = vi.fn(async () => json({ reports: [], next_before: null }));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    await expect(c.reporterReports("GA")).resolves.toEqual({ reports: [], nextBefore: null });
  });

  it("throws IndexerError on a 404", async () => {
    const f = async () => json({ error: "not found" }, 404);
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    await expect(c.reporterReports("GA")).rejects.toMatchObject({
      name: "IndexerError",
      status: 404,
    });
  });
});
