/**
 * Optional in-memory cache for SDK method calls with stale-while-revalidate
 * semantics.
 *
 * Usage:
 *   const cache = new RpcCache({ maxAge: 30_000, staleWhileRevalidate: 60_000 });
 *   const result = await cache.get("key", () => expensiveRpcCall());
 *
 * - `maxAge`: how long a response is considered fresh (ms). Default: 30 000.
 * - `staleWhileRevalidate`: how long a stale entry may be served while a
 *   background refresh runs (ms). Default: 60 000. Set to 0 to disable SWR.
 */

export interface CacheOptions {
  /** Max age before an entry becomes stale (ms). Default: 30 000. */
  maxAge?: number;
  /** Additional window during which stale data may be returned while a
   *  background refresh is in flight (ms). Default: 60 000. */
  staleWhileRevalidate?: number;
}

interface Entry<T> {
  value: T;
  fetchedAt: number;
  revalidating: boolean;
}

export class RpcCache {
  private readonly maxAge: number;
  private readonly staleWhileRevalidate: number;
  private readonly store = new Map<string, Entry<unknown>>();

  constructor(opts: CacheOptions = {}) {
    this.maxAge = opts.maxAge ?? 30_000;
    this.staleWhileRevalidate = opts.staleWhileRevalidate ?? 60_000;
  }

  /** Return a cached value or call `fetch` to populate the cache. */
  async get<T>(key: string, fetch: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const entry = this.store.get(key) as Entry<T> | undefined;

    if (entry) {
      const age = now - entry.fetchedAt;
      if (age < this.maxAge) {
        return entry.value;
      }
      if (age < this.maxAge + this.staleWhileRevalidate) {
        if (!entry.revalidating) {
          entry.revalidating = true;
          fetch()
            .then((value) => {
              this.store.set(key, { value, fetchedAt: Date.now(), revalidating: false });
            })
            .catch(() => {
              entry.revalidating = false;
            });
        }
        return entry.value;
      }
    }

    const value = await fetch();
    this.store.set(key, { value, fetchedAt: Date.now(), revalidating: false });
    return value;
  }

  /** Remove all entries. */
  clear(): void {
    this.store.clear();
  }

  /** Remove one entry. */
  delete(key: string): void {
    this.store.delete(key);
  }
}
