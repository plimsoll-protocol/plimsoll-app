import { describe, expect, it, vi } from "vitest";
import { IndexerClient, IndexerError } from "../src/index";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const REPORTED = {
  running: true,
  interval_seconds: 900,
  last_run_at: "2026-11-26T11:58:00Z",
  last_run_outcome: "ok",
  assets: [
    {
      sac: "CSAC",
      last_run_at: "2026-11-26T11:58:00Z",
      outcome: "ok",
      recovered_supply: 0,
      recovered_reports: 1,
      error: null,
    },
  ],
};

describe("IndexerClient reconcileStatus", () => {
  it("reads /v1/reconcile narrowed to one asset", async () => {
    const f = vi.fn(async () => json(REPORTED));
    const c = new IndexerClient("http://x/", f as unknown as typeof fetch);
    await expect(c.reconcileStatus("C SAC")).resolves.toEqual(REPORTED);
    expect((f.mock.calls[0] as unknown[])[0]).toBe("http://x/v1/reconcile?asset=C%20SAC");
  });

  it("asks for the whole job when no asset is named", async () => {
    const f = vi.fn(async () => json({ ...REPORTED, assets: [] }));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    await expect(c.reconcileStatus()).resolves.toMatchObject({ running: true });
    expect((f.mock.calls[0] as unknown[])[0]).toBe("http://x/v1/reconcile");
  });

  it("reports null for an indexer that does not serve the endpoint", async () => {
    const f = vi.fn(async () => json({ code: "not_found", message: "not found" }, 404));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    await expect(c.reconcileStatus("CSAC")).resolves.toBeNull();
  });

  it("still throws for other failures", async () => {
    const f = vi.fn(async () => json({ code: "internal_error", message: "boom" }, 500));
    const c = new IndexerClient("http://x", f as unknown as typeof fetch);
    const err = await c.reconcileStatus("CSAC").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IndexerError);
    expect((err as IndexerError).status).toBe(500);
  });
});
