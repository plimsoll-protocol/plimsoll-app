import { TESTNET } from "./networks";

export interface EndpointHealth {
  ok: boolean;
  latencyMs: number;
}

export interface HealthCheckResult {
  indexer: EndpointHealth;
  rpc: EndpointHealth;
}

export interface HealthCheckOptions {
  /** Base URL of the Plimsoll indexer (optional). */
  indexerUrl?: string;
  /** Soroban RPC URL (defaults to `TESTNET.rpcUrl`). */
  rpcUrl?: string;
  /** Custom fetch implementation (defaults to global `fetch`). */
  fetchFn?: typeof fetch;
}

async function probeEndpoint(fn: () => Promise<boolean>): Promise<EndpointHealth> {
  const start = performance.now();
  try {
    const ok = await fn();
    return { ok, latencyMs: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, latencyMs: Math.round(performance.now() - start) };
  }
}

/**
 * Check health and measure latency (via `performance.now()`) for both the
 * indexer and Soroban RPC endpoints.
 */
export async function healthCheck(options: HealthCheckOptions = {}): Promise<HealthCheckResult> {
  const { indexerUrl, rpcUrl = TESTNET.rpcUrl, fetchFn = fetch } = options;

  const [indexer, rpc] = await Promise.all([
    probeEndpoint(async () => {
      if (!indexerUrl) return false;
      const res = await fetchFn(`${indexerUrl.replace(/\/$/, "")}/healthz`);
      return res.ok;
    }),
    probeEndpoint(async () => {
      const res = await fetchFn(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      });
      if (!res.ok) return false;
      const json = (await res.json()) as { result?: { status?: string } };
      return json.result?.status === "healthy";
    }),
  ]);

  return { indexer, rpc };
}
