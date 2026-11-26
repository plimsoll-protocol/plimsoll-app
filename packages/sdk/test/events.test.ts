import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  subscribeCoverageEvents,
  type CoverageEvent,
  type CoverageStreamState,
  type EventSourceLike,
} from "../src/events";

/** Minimal controllable EventSource mock. */
class MockEventSource implements EventSourceLike {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  close = vi.fn();

  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  open(): void {
    this.onopen?.();
  }

  error(): void {
    this.onerror?.(new Event("error"));
  }
}

function makeFactory(sources: MockEventSource[]) {
  let i = 0;
  return (/* url */): EventSourceLike => {
    const es = sources[i++];
    if (!es) throw new Error("unexpected EventSource construction");
    return es;
  };
}

describe("subscribeCoverageEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("delivers a supply_posted event to the callback", () => {
    const es = new MockEventSource();
    const received: CoverageEvent[] = [];
    const sub = subscribeCoverageEvents("http://indexer", "C123", (ev) => received.push(ev), {
      eventSourceFactory: makeFactory([es]),
    });

    const event: CoverageEvent = {
      kind: "supply_posted",
      sac: "C123",
      amount: "1000000",
      ledger: 42,
      poster: "GA…",
      tx_hash: "abc",
      posted_at: "2026-01-01T00:00:00Z",
    };
    es.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
    sub.unsubscribe();
  });

  it("delivers a report_posted event to the callback", () => {
    const es = new MockEventSource();
    const received: CoverageEvent[] = [];
    const sub = subscribeCoverageEvents("http://indexer", "C123", (ev) => received.push(ev), {
      eventSourceFactory: makeFactory([es]),
    });

    const event: CoverageEvent = {
      kind: "report_posted",
      sac: "C123",
      tier: "auditor_signed",
      amount: "9000000",
      as_of: "2026-01-01T00:00:00Z",
      reporter: "GA…",
      doc_hash: "deadbeef",
      doc_uri: "https://example.com/proof.pdf",
      tx_hash: "abc",
      posted_at: "2026-01-01T00:00:01Z",
    };
    es.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
    sub.unsubscribe();
  });

  it("delivers a coverage_changed event to the callback", () => {
    const es = new MockEventSource();
    const received: CoverageEvent[] = [];
    const sub = subscribeCoverageEvents("http://indexer", "C123", (ev) => received.push(ev), {
      eventSourceFactory: makeFactory([es]),
    });

    const event: CoverageEvent = {
      kind: "coverage_changed",
      sac: "C123",
      bps: 10500,
      tier: "auditor_signed",
    };
    es.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
    sub.unsubscribe();
  });

  it("ignores malformed JSON", () => {
    const es = new MockEventSource();
    const received: CoverageEvent[] = [];
    const sub = subscribeCoverageEvents("http://indexer", "C123", (ev) => received.push(ev), {
      eventSourceFactory: makeFactory([es]),
    });

    es.onmessage?.({ data: "not json{{{" });

    expect(received).toHaveLength(0);
    sub.unsubscribe();
  });

  it("ignores JSON objects with unknown kind", () => {
    const es = new MockEventSource();
    const received: CoverageEvent[] = [];
    const sub = subscribeCoverageEvents("http://indexer", "C123", (ev) => received.push(ev), {
      eventSourceFactory: makeFactory([es]),
    });

    es.emit({ kind: "unknown_future_event", sac: "C123" });

    expect(received).toHaveLength(0);
    sub.unsubscribe();
  });

  it("reconnects after an error with back-off", () => {
    const es1 = new MockEventSource();
    const es2 = new MockEventSource();
    const received: CoverageEvent[] = [];
    const sub = subscribeCoverageEvents("http://indexer", "C123", (ev) => received.push(ev), {
      eventSourceFactory: makeFactory([es1, es2]),
      initialBackoffMs: 500,
      maxBackoffMs: 30_000,
    });

    // first connection errors
    es1.error();
    expect(es1.close).toHaveBeenCalled();

    // advance past back-off delay so the second connection opens
    vi.advanceTimersByTime(600);

    const event: CoverageEvent = {
      kind: "coverage_changed",
      sac: "C123",
      bps: 9800,
      tier: "transcribed",
    };
    es2.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
    sub.unsubscribe();
  });

  it("unsubscribe() closes the EventSource and suppresses further events", () => {
    const es = new MockEventSource();
    const received: CoverageEvent[] = [];
    const sub = subscribeCoverageEvents("http://indexer", "C123", (ev) => received.push(ev), {
      eventSourceFactory: makeFactory([es]),
    });

    sub.unsubscribe();
    expect(es.close).toHaveBeenCalled();

    es.emit({ kind: "coverage_changed", sac: "C123", bps: 100, tier: null });
    expect(received).toHaveLength(0);
  });

  it("does not connect when signal is already aborted", () => {
    const factory = vi.fn();
    const sub = subscribeCoverageEvents("http://indexer", "C123", () => undefined, {
      eventSourceFactory: factory,
      signal: AbortSignal.abort(),
    });

    expect(factory).not.toHaveBeenCalled();
    sub.unsubscribe(); // should not throw
  });

  it("unsubscribes when the AbortSignal fires", () => {
    const es = new MockEventSource();
    const ctl = new AbortController();
    const sub = subscribeCoverageEvents("http://indexer", "C123", () => undefined, {
      eventSourceFactory: makeFactory([es]),
      signal: ctl.signal,
    });

    ctl.abort();
    expect(es.close).toHaveBeenCalled();
    sub.unsubscribe(); // idempotent
  });

  it("reports connecting, live, paused and connecting again", () => {
    const es1 = new MockEventSource();
    const es2 = new MockEventSource();
    const states: CoverageStreamState[] = [];
    const sub = subscribeCoverageEvents("http://indexer", "C123", () => undefined, {
      eventSourceFactory: makeFactory([es1, es2]),
      initialBackoffMs: 100,
      maxBackoffMs: 1_000,
      onStateChange: (s) => states.push(s),
    });

    expect(states).toEqual(["connecting"]);
    es1.open();
    expect(states).toEqual(["connecting", "live"]);
    es1.error();
    expect(states).toEqual(["connecting", "live", "paused"]);
    vi.advanceTimersByTime(150);
    expect(states).toEqual(["connecting", "live", "paused", "connecting"]);
    es2.open();
    expect(states).toEqual(["connecting", "live", "paused", "connecting", "live"]);
    sub.unsubscribe();
  });

  it("reports live on a message even when the implementation never fires onopen", () => {
    const es = new MockEventSource();
    const states: CoverageStreamState[] = [];
    const sub = subscribeCoverageEvents("http://indexer", "C123", () => undefined, {
      eventSourceFactory: makeFactory([es]),
      onStateChange: (s) => states.push(s),
    });

    es.emit({ kind: "coverage_changed", sac: "C123", bps: 9_800, tier: null });
    expect(states).toEqual(["connecting", "live"]);
    sub.unsubscribe();
  });

  it("resets the back-off once a connection opens", () => {
    const sources = [new MockEventSource(), new MockEventSource(), new MockEventSource()];
    let built = 0;
    const factory = (): EventSourceLike => {
      const es = sources[built++];
      if (!es) throw new Error("unexpected EventSource construction");
      return es;
    };
    const sub = subscribeCoverageEvents("http://indexer", "C123", () => undefined, {
      eventSourceFactory: factory,
      initialBackoffMs: 500,
      maxBackoffMs: 30_000,
    });

    sources[0]!.error();
    vi.advanceTimersByTime(600);
    // The first retry waits 500ms and opens; that open resets the delay, so the
    // next drop retries after 500ms again rather than the doubled 1000ms.
    sources[1]!.open();
    sources[1]!.error();
    vi.advanceTimersByTime(600);
    expect(built).toBe(3);

    sub.unsubscribe();
  });

  it("URL-encodes the SAC in the stream URL", () => {
    const urls: string[] = [];
    const es = new MockEventSource();
    const factory = (url: string): EventSourceLike => {
      urls.push(url);
      return es;
    };
    const sub = subscribeCoverageEvents("http://indexer", "C…/special sac", () => undefined, {
      eventSourceFactory: factory,
    });
    expect(urls[0]).toBe("http://indexer/v1/assets/C%E2%80%A6%2Fspecial%20sac/events");
    sub.unsubscribe();
  });
});
