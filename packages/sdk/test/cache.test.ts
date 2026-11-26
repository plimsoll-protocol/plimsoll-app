import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RpcCache } from "../src/cache";

describe("RpcCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls fetchFn on cache miss and returns the value", async () => {
    const cache = new RpcCache({ maxAge: 5000, staleWhileRevalidate: 5000 });
    const fetch = vi.fn().mockResolvedValue("hello");
    const result = await cache.get("k", fetch);
    expect(result).toBe("hello");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("returns cached value without calling fetchFn when fresh", async () => {
    const cache = new RpcCache({ maxAge: 5000, staleWhileRevalidate: 5000 });
    const fetch = vi.fn().mockResolvedValue("hello");
    await cache.get("k", fetch);
    vi.advanceTimersByTime(2000);
    const result = await cache.get("k", fetch);
    expect(result).toBe("hello");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("blocks and re-fetches when entry is fully expired", async () => {
    const cache = new RpcCache({ maxAge: 5000, staleWhileRevalidate: 5000 });
    const fetch = vi.fn().mockResolvedValue("v1");
    await cache.get("k", fetch);
    vi.advanceTimersByTime(11000);
    fetch.mockResolvedValue("v2");
    const result = await cache.get("k", fetch);
    expect(result).toBe("v2");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("serves stale value within SWR window and revalidates in background", async () => {
    const cache = new RpcCache({ maxAge: 5000, staleWhileRevalidate: 5000 });
    let resolveRevalidation!: (v: string) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce("v1")
      .mockReturnValueOnce(
        new Promise<string>((res) => {
          resolveRevalidation = res;
        }),
      );

    await cache.get("k", fetch);
    vi.advanceTimersByTime(7000); // past maxAge, within SWR

    const stale = await cache.get("k", fetch);
    expect(stale).toBe("v1");
    expect(fetch).toHaveBeenCalledTimes(2);

    resolveRevalidation("v2");
    await Promise.resolve();
    await Promise.resolve();

    vi.advanceTimersByTime(1000);
    fetch.mockResolvedValue("v3");
    const fresh = await cache.get("k", fetch);
    expect(fresh).toBe("v2");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not trigger a second background revalidation while one is running", async () => {
    const cache = new RpcCache({ maxAge: 5000, staleWhileRevalidate: 10000 });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce("v1")
      .mockReturnValue(new Promise(() => undefined));

    await cache.get("k", fetch);
    vi.advanceTimersByTime(6000);

    await cache.get("k", fetch); // triggers background revalidation
    await cache.get("k", fetch); // must NOT trigger a second one
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("delete() removes the entry", async () => {
    const cache = new RpcCache({ maxAge: 5000, staleWhileRevalidate: 5000 });
    const fetch = vi.fn().mockResolvedValue("v1");
    await cache.get("k", fetch);
    cache.delete("k");
    fetch.mockResolvedValue("v2");
    const result = await cache.get("k", fetch);
    expect(result).toBe("v2");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("clear() removes all entries", async () => {
    const cache = new RpcCache({ maxAge: 5000, staleWhileRevalidate: 5000 });
    const fetch = vi.fn().mockResolvedValue("v1");
    await cache.get("a", fetch);
    await cache.get("b", fetch);
    cache.clear();
    fetch.mockResolvedValue("v2");
    expect(await cache.get("a", fetch)).toBe("v2");
    expect(await cache.get("b", fetch)).toBe("v2");
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
