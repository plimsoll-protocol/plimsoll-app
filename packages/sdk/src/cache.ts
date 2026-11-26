/**
 * In-memory RPC response cache with stale-while-revalidate semantics.
 *
 * Time windows (all in milliseconds):
 *   - [0, maxAge)                 → fresh: return cached value immediately
 *   - [maxAge, maxAge + swr)      → stale: return cached value + kick off one
 *                                   background revalidation
 *   - [maxAge + swr, ∞)           → expired: block until a fresh value arrives
 */
export interface RpcCacheOptions {
  /** Maximum age in ms for which a cached value is considered fresh. */
  maxAge: number;
  /** Extra window in ms after maxAge during which stale data is served while
   *  a background re-fetch runs. */
  staleWhileRevalidate: number;
}

interface Entry<T> {
  value: T;
  fetchedAt: number;
  revalidating: boolean;
}

export class RpcCache {
  private readonly maxAge: number;
  private readonly swr: number;
  private readonly store = new Map<string, Entry<unknown>>();

  constructor(opts: RpcCacheOptions) {
    this.maxAge = opts.maxAge;
    this.swr = opts.staleWhileRevalidate;
  }

  /**
   * Return the cached value for `key` when fresh, serve stale + revalidate in
   * the background when within the SWR window, or block for a fresh value when
   * fully expired.
   */
  async get<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const entry = this.store.get(key) as Entry<T> | undefined;

    if (entry) {
      const age = now - entry.fetchedAt;

      if (age < this.maxAge) {
        return entry.value;
      }

      if (age < this.maxAge + this.swr) {
        if (!entry.revalidating) {
          entry.revalidating = true;
          fetchFn()
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

    const value = await fetchFn();
    this.store.set(key, { value, fetchedAt: Date.now(), revalidating: false });
    return value;
  }

  /** Remove a single key from the cache. */
  delete(key: string): void {
    this.store.delete(key);
  }

  /** Remove all entries from the cache. */
  clear(): void {
    this.store.clear();
  }
}
