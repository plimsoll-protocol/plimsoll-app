/**
 * `for await` access to the indexer's live reserve reports.
 *
 * Wraps the Server-Sent Events stream behind {@link subscribeCoverageEvents} in
 * an async iterator, so a consumer can write
 *
 * ```ts
 * for await (const report of indexer.streamReports(sac)) {
 *   console.log(report.tier, report.amount);
 * }
 * ```
 *
 * and stop with `break`, `return()` or an `AbortSignal`; every one of those
 * closes the underlying `EventSource`.
 */

import {
  subscribeCoverageEvents,
  type CoverageEvent,
  type CoverageSubscription,
  type ReportPostedEvent,
  type SubscribeOptions,
} from "./events";
import type { IndexerReport } from "./indexer";

/** Default cap on reports held for a consumer that is slower than the stream. */
export const DEFAULT_MAX_BUFFERED_REPORTS = 1_000;

/** Options for {@link streamReports}. */
export interface StreamReportsOptions extends SubscribeOptions {
  /**
   * Most reports to hold while the consumer is busy. If it falls further
   * behind than this the stream ends with a {@link ReportStreamOverflowError}
   * rather than silently dropping reports. Default: 1 000.
   */
  maxBuffered?: number;
}

/** Thrown from the iterator when the consumer fell too far behind the stream. */
export class ReportStreamOverflowError extends Error {
  constructor(readonly maxBuffered: number) {
    super(`report stream overflowed: more than ${maxBuffered} reports were waiting to be read`);
    this.name = "ReportStreamOverflowError";
  }
}

/** The iterator returned by {@link streamReports}. */
export type ReportStream = AsyncIterableIterator<IndexerReport>;

function toReport(event: ReportPostedEvent): IndexerReport {
  return {
    tier: event.tier,
    amount: event.amount,
    as_of: event.as_of,
    posted_at: event.posted_at,
    reporter: event.reporter,
    doc_hash: event.doc_hash,
    doc_uri: event.doc_uri,
    tx_hash: event.tx_hash,
    source: "event",
  };
}

/**
 * Stream reserve reports for one asset as they are indexed.
 *
 * The connection opens on the first `next()` call, not when the function is
 * called, so an iterator that is never read costs nothing. Reports that arrive
 * while the consumer is busy are kept in order, up to `maxBuffered`. Dropped
 * connections reconnect on their own (see {@link subscribeCoverageEvents});
 * the iterator keeps waiting and does not throw for a network error.
 *
 * The iterator ends cleanly, and closes the `EventSource`, when:
 * - the `for await` loop exits early (`break`, `return`, a thrown error),
 * - `return()` is called, including while a `next()` is still pending,
 * - the `signal` option aborts.
 *
 * @param indexerBase Base URL of the plimsoll-indexer.
 * @param asset Stellar Asset Contract address to watch.
 * @param options Reconnect, abort, buffering and test-injection settings.
 */
export function streamReports(
  indexerBase: string,
  asset: string,
  options: StreamReportsOptions = {},
): ReportStream {
  const { maxBuffered = DEFAULT_MAX_BUFFERED_REPORTS, signal, ...subscribeOptions } = options;
  if (!Number.isInteger(maxBuffered) || maxBuffered < 1) {
    throw new RangeError("maxBuffered must be a positive integer");
  }

  const queue: IndexerReport[] = [];
  const waiting: Array<(result: IteratorResult<IndexerReport>) => void> = [];
  let subscription: CoverageSubscription | null = null;
  let started = false;
  let done = false;
  let failure: Error | null = null;

  const finished = (): IteratorResult<IndexerReport> => ({ done: true, value: undefined });

  function close(): void {
    if (done) return;
    done = true;
    subscription?.unsubscribe();
    subscription = null;
    signal?.removeEventListener("abort", onAbort);
    // A reader that is still waiting has nothing more to wait for.
    for (const resolve of waiting.splice(0)) resolve(finished());
  }

  function onAbort(): void {
    queue.length = 0;
    close();
  }

  function onEvent(event: CoverageEvent): void {
    if (done || event.kind !== "report_posted" || event.sac !== asset) return;
    const report = toReport(event);
    const reader = waiting.shift();
    if (reader) {
      reader({ done: false, value: report });
      return;
    }
    if (queue.length >= maxBuffered) {
      failure = new ReportStreamOverflowError(maxBuffered);
      close();
      return;
    }
    queue.push(report);
  }

  function start(): void {
    if (started) return;
    started = true;
    if (signal?.aborted) {
      done = true;
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    subscription = subscribeCoverageEvents(indexerBase, asset, onEvent, subscribeOptions);
  }

  const stream: ReportStream = {
    next(): Promise<IteratorResult<IndexerReport>> {
      start();
      const queued = queue.shift();
      if (queued) return Promise.resolve({ done: false, value: queued });
      if (failure) {
        const error = failure;
        failure = null;
        return Promise.reject(error);
      }
      if (done) return Promise.resolve(finished());
      return new Promise((resolve) => {
        waiting.push(resolve);
      });
    },

    return(): Promise<IteratorResult<IndexerReport>> {
      queue.length = 0;
      failure = null;
      started = true;
      close();
      return Promise.resolve(finished());
    },

    [Symbol.asyncIterator](): ReportStream {
      return stream;
    },
  };
  return stream;
}
