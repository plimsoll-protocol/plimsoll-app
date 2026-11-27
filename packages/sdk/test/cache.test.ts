import { describe, expect, it, vi } from "vitest";
import { RpcCache } from "../src/cache";

describe("RpcCache", () => {
  it("calls fetch on cache miss", async () => {
    const cache = new RpcCache({ maxAge: 10_000 });
    const fetch = vi.fn().mockResolvedValue("hello");
    const result = await cache.get("key", fetch);
    expect(result).toBe("hello");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("returns cached value on cache hit", async () => {
    const cache = new RpcCache({ maxAge: 10_000 });
    const fetch = vi.fn().mockResolvedValue("world");
    await cache.get("key", fetch);
    const result = await cache.get("key", fetch);
    expect(result).toBe("world");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("re-fetches after maxAge expires", async () => {
    vi.useFakeTimers();
    const cache = new RpcCache({ maxAge: 1_000, staleWhileRevalidate: 0 });
    const fetch = vi.fn().mockResolvedValue("v1");
    await cache.get("key", fetch);
    vi.advanceTimersByTime(1_001);
    fetch.mockResolvedValue("v2");
    const result = await cache.get("key", fetch);
    expect(result).toBe("v2");
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("serves stale value while revalidating in SWR window", async () => {
    vi.useFakeTimers();
    const cache = new RpcCache({ maxAge: 1_000, staleWhileRevalidate: 5_000 });

    let resolveRevalidation!: (v: string) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce("v1")
      .mockImplementationOnce(
        () => new Promise<string>((res) => { resolveRevalidation = res; }),
      );

    await cache.get("key", fetch);
    vi.advanceTimersByTime(2_000); // past maxAge, within SWR window

    const stale = await cache.get("key", fetch);
    expect(stale).toBe("v1"); // stale value served immediately

    resolveRevalidation("v2");
    await Promise.resolve(); // flush microtasks
    await Promise.resolve();

    // After revalidation, fresh value is returned
    const fresh = await cache.get("key", fetch);
    expect(fresh).toBe("v2");
    vi.useRealTimers();
  });

  it("triggers only one background revalidation for concurrent stale hits", async () => {
    vi.useFakeTimers();
    const cache = new RpcCache({ maxAge: 1_000, staleWhileRevalidate: 5_000 });
    const fetch = vi.fn().mockResolvedValue("v1");
    await cache.get("key", fetch);
    vi.advanceTimersByTime(2_000);
    fetch.mockResolvedValue("v2");

    await Promise.all([
      cache.get("key", fetch),
      cache.get("key", fetch),
      cache.get("key", fetch),
    ]);
    // Only 1 background revalidation should fire (second call does not start another)
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("clear() removes all entries", async () => {
    const cache = new RpcCache({ maxAge: 10_000 });
    const fetch = vi.fn().mockResolvedValue("v1");
    await cache.get("a", fetch);
    await cache.get("b", fetch);
    cache.clear();
    fetch.mockResolvedValue("v2");
    expect(await cache.get("a", fetch)).toBe("v2");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("delete() removes one entry", async () => {
    const cache = new RpcCache({ maxAge: 10_000 });
    const fetch = vi.fn().mockResolvedValue("v1");
    await cache.get("a", fetch);
    await cache.get("b", fetch);
    cache.delete("a");
    fetch.mockResolvedValue("v2");
    expect(await cache.get("a", fetch)).toBe("v2");
    expect(await cache.get("b", fetch)).toBe("v1"); // still cached
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
