/**
 * Typed SSE subscription helper for coverage events from the plimsoll-indexer.
 *
 * The indexer exposes a Server-Sent Events stream at
 * `GET /v1/assets/{sac}/events` that emits one JSON object per event as it is
 * indexed. This module wraps that stream and delivers typed `CoverageEvent`
 * objects to a callback, with automatic reconnect on drop.
 */

/** A new supply snapshot was posted for the asset. */
export interface SupplyPostedEvent {
  kind: "supply_posted";
  sac: string;
  amount: string;
  ledger: number;
  poster: string;
  tx_hash: string;
  posted_at: string;
}

/** A new reserve report was posted for the asset. */
export interface ReportPostedEvent {
  kind: "report_posted";
  sac: string;
  tier: "transcribed" | "issuer_signed" | "auditor_signed";
  amount: string;
  as_of: string;
  reporter: string;
  doc_hash: string;
  doc_uri: string;
  tx_hash: string;
  posted_at: string;
}

/** The computed coverage ratio changed (emitted after every supply or report event). */
export interface CoverageChangedEvent {
  kind: "coverage_changed";
  sac: string;
  bps: number | null;
  tier: "transcribed" | "issuer_signed" | "auditor_signed" | null;
}

/** Union of all event variants the SSE stream can deliver. */
export type CoverageEvent = SupplyPostedEvent | ReportPostedEvent | CoverageChangedEvent;

/** Callback invoked for each event received from the stream. */
export type CoverageEventCallback = (event: CoverageEvent) => void;

/**
 * Connection state of a coverage event stream. "live" means the connection is
 * open, "paused" that it dropped and a reconnect is scheduled, and
 * "connecting" that an attempt is in flight.
 */
export type CoverageStreamState = "connecting" | "live" | "paused";

/** Options for {@link subscribeCoverageEvents}. */
export interface SubscribeOptions {
  /**
   * Initial delay in milliseconds before the first reconnect attempt.
   * Doubles after every failure, capped at `maxBackoffMs`. Default: 1 000 ms.
   */
  initialBackoffMs?: number;
  /**
   * Maximum reconnect delay in milliseconds. Default: 30 000 ms.
   */
  maxBackoffMs?: number;
  /**
   * AbortSignal that cancels the subscription when aborted.
   */
  signal?: AbortSignal;
  /**
   * Called whenever the stream's connection state changes, so a caller can say
   * that live updates are paused and clear that when the stream comes back.
   */
  onStateChange?: (state: CoverageStreamState) => void;
  /**
   * Optional factory for EventSource instances. Defaults to the global
   * `EventSource` constructor. Supply a mock in tests.
   */
  eventSourceFactory?: (url: string) => EventSourceLike;
}

/** Minimal EventSource interface used by the helper (testable). */
export interface EventSourceLike {
  onopen?: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  close(): void;
}

/** Returned by {@link subscribeCoverageEvents}; call `unsubscribe()` to stop. */
export interface CoverageSubscription {
  /** Stop receiving events and close the underlying SSE connection. */
  unsubscribe(): void;
}

/**
 * Subscribe to coverage events for a single asset from the plimsoll-indexer.
 *
 * Opens an SSE stream at `{indexerBase}/v1/assets/{sac}/events` and calls
 * `callback` for each well-typed event. The connection is re-established
 * automatically on error with exponential back-off.
 *
 * @param indexerBase  Base URL of the plimsoll-indexer (no trailing slash).
 * @param sac          Stellar Asset Contract address to watch.
 * @param callback     Function called for each {@link CoverageEvent}.
 * @param options      Optional reconnect and abort settings.
 * @returns A {@link CoverageSubscription} whose `unsubscribe()` stops the stream.
 *
 * @example
 * ```ts
 * const sub = subscribeCoverageEvents(
 *   "https://indexer.example.com",
 *   "C…SAC…",
 *   (ev) => console.log(ev.kind, ev),
 * );
 * // later:
 * sub.unsubscribe();
 * ```
 */
export function subscribeCoverageEvents(
  indexerBase: string,
  sac: string,
  callback: CoverageEventCallback,
  options: SubscribeOptions = {},
): CoverageSubscription {
  const {
    initialBackoffMs = 1_000,
    maxBackoffMs = 30_000,
    signal,
    onStateChange,
    eventSourceFactory,
  } = options;

  let currentEs: EventSourceLike | null = null;
  let backoffMs = initialBackoffMs;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let state: CoverageStreamState | null = null;

  // Only report a change in state, so a burst of errors cannot repeat "paused".
  function setState(next: CoverageStreamState): void {
    if (state === next) return;
    state = next;
    onStateChange?.(next);
  }

  const url = `${indexerBase}/v1/assets/${encodeURIComponent(sac)}/events`;

  function connect(): void {
    if (stopped) return;

    setState("connecting");

    const factory =
      eventSourceFactory ?? ((u: string): EventSourceLike => new EventSource(u) as EventSourceLike);

    const es = factory(url);
    currentEs = es;

    es.onopen = () => {
      if (stopped || currentEs !== es) return;
      // A connection that opened resets the back-off, so a link that flaps
      // retries quickly again instead of waiting at the ceiling.
      backoffMs = initialBackoffMs;
      setState("live");
    };

    es.onmessage = (ev) => {
      if (stopped || currentEs !== es) return;
      // A message is proof the stream is up, for an EventSource that never
      // fires onopen (an older browser or a minimal implementation).
      setState("live");
      try {
        const parsed: unknown = JSON.parse(ev.data);
        if (isCoverageEvent(parsed)) {
          callback(parsed);
        }
      } catch {
        // malformed JSON — skip
      }
    };

    es.onerror = () => {
      if (stopped || currentEs !== es) return;
      es.close();
      currentEs = null;
      setState("paused");
      retryTimer = setTimeout(() => {
        retryTimer = null;
        backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
        connect();
      }, backoffMs);
    };
  }

  function unsubscribe(): void {
    stopped = true;
    if (retryTimer !== null) clearTimeout(retryTimer);
    if (currentEs !== null) {
      currentEs.close();
      currentEs = null;
    }
  }

  if (signal?.aborted) {
    return { unsubscribe };
  }
  signal?.addEventListener("abort", unsubscribe, { once: true });

  connect();

  return { unsubscribe };
}

function isCoverageEvent(v: unknown): v is CoverageEvent {
  if (typeof v !== "object" || v === null) return false;
  const kind = (v as Record<string, unknown>)["kind"];
  return kind === "supply_posted" || kind === "report_posted" || kind === "coverage_changed";
}
