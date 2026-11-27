import { describe, expect, it, vi } from "vitest";
import { IndexerAbortError, IndexerClient, IndexerError } from "../src/index";
import type { IndexerReport } from "../src/index";

const SAC = "CCHPT4TEJDPZQDSUVW3NP6A35ROGV4WEFZKT45SKWYCFZSUB7R5HIM7S";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const REPORT: IndexerReport = {
  tier: "auditor_signed",
  amount: "10200000000000",
  as_of: "2026-10-01T00:00:00Z",
  posted_at: "2026-10-01T00:05:00Z",
  reporter: "GREPORTER",
  doc_hash: "ab".repeat(32),
  doc_uri: "https://example.com/proof.pdf",
  tx_hash: "cd".repeat(32),
  source: "event",
};

function client(fetchImpl: (...args: never[]) => Promise<Response>): IndexerClient {
  return new IndexerClient("http://indexer.test/", fetchImpl as unknown as typeof fetch);
}

describe("IndexerClient.getReportBySeq", () => {
  it("fetches /v1/assets/{sac}/reports/{seq} and returns the report", async () => {
    const f = vi.fn(async () => json(REPORT));
    await expect(client(f).getReportBySeq(SAC, 7)).resolves.toEqual(REPORT);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe(
      `http://indexer.test/v1/assets/${SAC}/reports/7`,
    );
  });

  it("accepts sequence zero, the first report", async () => {
    const f = vi.fn(async () => json(REPORT));
    await client(f).getReportBySeq(SAC, 0);
    expect((f.mock.calls[0] as unknown as [string])[0]).toMatch(/\/reports\/0$/);
  });

  it("returns null for an unknown seq", async () => {
    const f = vi.fn(async () => json({ error: "report not found" }, 404));
    await expect(client(f).getReportBySeq(SAC, 9999)).resolves.toBeNull();
  });

  it("returns null when the 404 carries no message at all", async () => {
    const f = vi.fn(async () => new Response("", { status: 404 }));
    await expect(client(f).getReportBySeq(SAC, 3)).resolves.toBeNull();
  });

  it("throws, not null, for an unknown asset", async () => {
    const f = vi.fn(async () => json({ error: "asset not found" }, 404));
    const error = await client(f)
      .getReportBySeq(SAC, 1)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IndexerError);
    expect((error as IndexerError).status).toBe(404);
    expect((error as IndexerError).message).toBe("asset not found");
  });

  it("throws on other HTTP failures instead of reporting a missing report", async () => {
    for (const status of [400, 429, 500, 503]) {
      const f = vi.fn(async () => json({ error: "nope" }, status));
      const error = await client(f)
        .getReportBySeq(SAC, 1)
        .catch((e: unknown) => e);
      expect(error, String(status)).toBeInstanceOf(IndexerError);
      expect((error as IndexerError).status).toBe(status);
    }
  });

  it("lets a network failure through rather than returning null", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(client(f).getReportBySeq(SAC, 1)).rejects.toThrow("fetch failed");
  });

  it("rejects a seq that cannot be one, before any request", async () => {
    const f = vi.fn(async () => json(REPORT));
    const c = client(f);
    for (const seq of [-1, 1.5, Number.NaN, Infinity, 2 ** 53, "7" as unknown as number]) {
      await expect(c.getReportBySeq(SAC, seq), String(seq)).rejects.toBeInstanceOf(RangeError);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("escapes the asset in the path", async () => {
    const f = vi.fn(async () => json(REPORT));
    await client(f).getReportBySeq("a/b?c", 1);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe(
      "http://indexer.test/v1/assets/a%2Fb%3Fc/reports/1",
    );
  });

  it("honours the abort signal and timeout like the other reads", async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      })) as unknown as (...args: never[]) => Promise<Response>;
    const c = client(hanging);

    const ctl = new AbortController();
    const pending = c.getReportBySeq(SAC, 1, { signal: ctl.signal });
    ctl.abort();
    await expect(pending).rejects.toBeInstanceOf(IndexerAbortError);

    await expect(c.getReportBySeq(SAC, 1, { timeoutMs: 5 })).rejects.toMatchObject({
      reason: "timeout",
    });
  });
});
