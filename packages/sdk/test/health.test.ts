import { describe, expect, it, vi } from "vitest";
import { healthCheck, type HealthCheckResult } from "../src/health";

describe("healthCheck", () => {
  it("returns structured ok and latencyMs for indexer and rpc", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/healthz")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { status: "healthy" } }),
        {
          status: 200,
        },
      );
    }) as unknown as typeof fetch;

    const result: HealthCheckResult = await healthCheck({
      indexerUrl: "https://indexer.example.com",
      rpcUrl: "https://rpc.example.com",
      fetchFn,
    });

    expect(result.indexer.ok).toBe(true);
    expect(typeof result.indexer.latencyMs).toBe("number");
    expect(result.indexer.latencyMs).toBeGreaterThanOrEqual(0);

    expect(result.rpc.ok).toBe(true);
    expect(typeof result.rpc.latencyMs).toBe("number");
    expect(result.rpc.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("handles failing endpoints gracefully", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const result = await healthCheck({
      indexerUrl: "https://indexer.example.com",
      rpcUrl: "https://rpc.example.com",
      fetchFn,
    });

    expect(result.indexer.ok).toBe(false);
    expect(result.rpc.ok).toBe(false);
  });
});
