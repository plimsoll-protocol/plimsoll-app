import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexerClient, ReportStreamOverflowError, streamReports } from "../src/index";
import type { CoverageEvent, EventSourceLike } from "../src/events";

/** A scripted EventSource: tests push events into it and watch it close. */
class MockEventSource implements EventSourceLike {
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {}

  emit(event: CoverageEvent | Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(event) });
  }

  fail(): void {
    this.onerror?.(new Event("error"));
  }
}

function harness() {
  const sources: MockEventSource[] = [];
  const eventSourceFactory = (url: string): EventSourceLike => {
    const es = new MockEventSource(url);
    sources.push(es);
    return es;
  };
  return { sources, eventSourceFactory };
}

const SAC = "CCHPT4TEJDPZQDSUVW3NP6A35ROGV4WEFZKT45SKWYCFZSUB7R5HIM7S";

function reportEvent(n: number, overrides: Record<string, unknown> = {}): CoverageEvent {
  return {
    kind: "report_posted",
    sac: SAC,
    tier: "auditor_signed",
    amount: String(1000 + n),
    as_of: `2026-01-0${n}T00:00:00Z`,
    reporter: "GREPORTER",
    doc_hash: `hash${n}`,
    doc_uri: `https://example.com/${n}.pdf`,
    tx_hash: `tx${n}`,
    posted_at: `2026-01-0${n}T00:00:01Z`,
    ...overrides,
  } as CoverageEvent;
}

/** Lets queued microtasks run so a pending next() has registered. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe("streamReports", () => {
  it("works in a for await loop and maps events to reports", async () => {
    const { sources, eventSourceFactory } = harness();
    const stream = streamReports("http://indexer", SAC, { eventSourceFactory });

    const seen: string[] = [];
    const loop = (async () => {
      for await (const report of stream) {
        seen.push(report.tx_hash);
        if (seen.length === 2) break;
      }
    })();

    await tick();
    sources[0]!.emit(reportEvent(1));
    sources[0]!.emit(reportEvent(2));
    await loop;

    expect(seen).toEqual(["tx1", "tx2"]);
  });

  it("yields the report fields the REST history returns", async () => {
    const { sources, eventSourceFactory } = harness();
    const stream = streamReports("http://indexer", SAC, { eventSourceFactory });
    const pending = stream.next();
    await tick();
    sources[0]!.emit(reportEvent(3));

    expect((await pending).value).toEqual({
      tier: "auditor_signed",
      amount: "1003",
      as_of: "2026-01-03T00:00:00Z",
      posted_at: "2026-01-03T00:00:01Z",
      reporter: "GREPORTER",
      doc_hash: "hash3",
      doc_uri: "https://example.com/3.pdf",
      tx_hash: "tx3",
      source: "event",
    });
    await stream.return?.();
  });

  it("opens the asset's events URL, and not before the first read", async () => {
    const { sources, eventSourceFactory } = harness();
    const stream = streamReports("http://indexer", SAC, { eventSourceFactory });
    expect(sources).toHaveLength(0);

    const pending = stream.next();
    expect(sources).toHaveLength(1);
    expect(sources[0]!.url).toBe(`http://indexer/v1/assets/${SAC}/events`);
    await stream.return?.();
    expect(await pending).toEqual({ done: true, value: undefined });
  });

  it("closes the EventSource when the loop breaks", async () => {
    const { sources, eventSourceFactory } = harness();
    const stream = streamReports("http://indexer", SAC, { eventSourceFactory });

    const seen: string[] = [];
    const loop = (async () => {
      for await (const report of stream) {
        seen.push(report.tx_hash);
        break;
      }
    })();
    await tick();
    sources[0]!.emit(reportEvent(1));
    await loop;

    expect(seen).toEqual(["tx1"]);
    expect(sources[0]!.close).toHaveBeenCalledTimes(1);
    expect(await stream.next()).toEqual({ done: true, value: undefined });
  });

  it("closes the EventSource when the loop body throws", async () => {
    const { sources, eventSourceFactory } = harness();
    const stream = streamReports("http://indexer", SAC, { eventSourceFactory });

    const loop = (async () => {
      for await (const report of stream) {
        throw new Error(`consumer failed on ${report.tx_hash}`);
      }
    })();
    await tick();
    sources[0]!.emit(reportEvent(1));

    await expect(loop).rejects.toThrow("consumer failed on tx1");
    expect(sources[0]!.close).toHaveBeenCalledTimes(1);
  });

  it("return() closes the source and ends a read that is still waiting", async () => {
    const { sources, eventSourceFactory } = harness();
    const stream = streamReports("http://indexer", SAC, { eventSourceFactory });

    const waiting = stream.next();
    await tick();
    expect(sources[0]!.close).not.toHaveBeenCalled();

    expect(await stream.return?.()).toEqual({ done: true, value: undefined });
    expect(sources[0]!.close).toHaveBeenCalledTimes(1);
    expect(await waiting).toEqual({ done: true, value: undefined });
  });

  it("ignores events after it has been closed", async () => {
    const { sources, eventSourceFactory } = harness();
    const stream = streamReports("http://indexer", SAC, { eventSourceFactory });
    const first = stream.next();
    await tick();
    await stream.return?.();
    await first;

    sources[0]!.emit(reportEvent(1));
    expect(await stream.next()).toEqual({ done: true, value: undefined });
  });

  it("calling return() twice closes the source once", async () => {
    const { sources, eventSourceFactory } = harness();
    const stream = streamReports("http://indexer", SAC, { eventSourceFactory });
    void stream.next();
    await tick();
    await stream.return?.();
    await stream.return?.();
    expect(sources[0]!.close).toHaveBeenCalledTimes(1);
  });

  it("return() before any read never opens a connection", async () => {
    const { sources, eventSourceFactory } = harness();
    const stream = streamReports("http://indexer", SAC, { eventSourceFactory });
    await stream.return?.();
    expect(await stream.next()).toEqual({ done: true, value: undefined });
    expect(sources).toHaveLength(0);
  });

  it("ends and closes when the abort signal fires", async () => {
    const { sources, eventSourceFactory } = harness();
    const controller = new AbortController();
    const stream = streamReports("http://indexer", SAC, {
      eventSourceFactory,
      signal: controller.signal,
    });

    const waiting = stream.next();
    await tick();
    controller.abort();

    expect(await waiting).toEqual({ done: true, value: undefined });
    expect(sources[0]!.close).toHaveBeenCalled();
  });

  it("does not connect when the signal is already aborted", async () => {
    const { sources, eventSourceFactory } = harness();
    const controller = new AbortController();
    controller.abort();
    const stream = streamReports("http://indexer", SAC, {
      eventSourceFactory,
      signal: controller.signal,
    });
    expect(await stream.next()).toEqual({ done: true, value: undefined });
    expect(sources).toHaveLength(0);
  });

  it("keeps reports that arrive while the consumer is busy, in order", async () => {
    const { sources, eventSourceFactory } = harness();
    const stream = streamReports("http://indexer", SAC, { eventSourceFactory });
    const first = stream.next();
    await tick();
    sources[0]!.emit(reportEvent(1));
    await first;

    sources[0]!.emit(reportEvent(2));
    sources[0]!.emit(reportEvent(3));
    expect((await stream.next()).value?.tx_hash).toBe("tx2");
    expect((await stream.next()).value?.tx_hash).toBe("tx3");
    await stream.return?.();
  });

  it("skips other event kinds, other assets and malformed messages", async () => {
    const { sources, eventSourceFactory } = harness();
    const stream = streamReports("http://indexer", SAC, { eventSourceFactory });
    const pending = stream.next();
    await tick();
    const es = sources[0]!;

    es.emit({
      kind: "supply_posted",
      sac: SAC,
      amount: "1",
      ledger: 1,
      poster: "G",
      tx_hash: "s",
      posted_at: "x",
    });
    es.emit({ kind: "coverage_changed", sac: SAC, bps: 10_000, tier: "issuer_signed" });
    es.emit(reportEvent(1, { sac: "COTHER" }));
    es.onmessage?.({ data: "not json{{" });
    es.emit(reportEvent(2));

    expect((await pending).value?.tx_hash).toBe("tx2");
    await stream.return?.();
  });

  it("keeps waiting through a dropped connection and reconnects", async () => {
    vi.useFakeTimers();
    const { sources, eventSourceFactory } = harness();
    const stream = streamReports("http://indexer", SAC, {
      eventSourceFactory,
      initialBackoffMs: 100,
    });

    const pending = stream.next();
    sources[0]!.fail();
    expect(sources[0]!.close).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(sources).toHaveLength(2);

    sources[1]!.emit(reportEvent(1));
    expect((await pending).value?.tx_hash).toBe("tx1");
    await stream.return?.();
    expect(sources[1]!.close).toHaveBeenCalled();
  });

  it("does not reconnect after it has been closed", async () => {
    vi.useFakeTimers();
    const { sources, eventSourceFactory } = harness();
    const stream = streamReports("http://indexer", SAC, {
      eventSourceFactory,
      initialBackoffMs: 100,
    });
    void stream.next();
    sources[0]!.fail();
    await stream.return?.();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sources).toHaveLength(1);
  });

  it("ends with an overflow error rather than dropping reports silently", async () => {
    const { sources, eventSourceFactory } = harness();
    const stream = streamReports("http://indexer", SAC, { eventSourceFactory, maxBuffered: 2 });
    const first = stream.next();
    await tick();
    sources[0]!.emit(reportEvent(1));
    await first;

    sources[0]!.emit(reportEvent(2));
    sources[0]!.emit(reportEvent(3));
    sources[0]!.emit(reportEvent(4));
    expect(sources[0]!.close).toHaveBeenCalledTimes(1);

    expect((await stream.next()).value?.tx_hash).toBe("tx2");
    expect((await stream.next()).value?.tx_hash).toBe("tx3");
    await expect(stream.next()).rejects.toBeInstanceOf(ReportStreamOverflowError);
    expect(await stream.next()).toEqual({ done: true, value: undefined });
  });

  it("rejects a buffer size that is not a positive integer", () => {
    for (const maxBuffered of [0, -1, 1.5, Number.NaN]) {
      expect(() => streamReports("http://indexer", SAC, { maxBuffered })).toThrow(RangeError);
    }
  });

  it("is its own async iterator", () => {
    const { eventSourceFactory } = harness();
    const stream = streamReports("http://indexer", SAC, { eventSourceFactory });
    expect(stream[Symbol.asyncIterator]()).toBe(stream);
  });
});

describe("IndexerClient.streamReports", () => {
  it("streams from the client's own base URL", async () => {
    const { sources, eventSourceFactory } = harness();
    const client = new IndexerClient("http://indexer.test///");
    const stream = client.streamReports(SAC, { eventSourceFactory });
    const pending = stream.next();
    await tick();

    expect(sources[0]!.url).toBe(`http://indexer.test/v1/assets/${SAC}/events`);
    sources[0]!.emit(reportEvent(1));
    expect((await pending).value?.tier).toBe("auditor_signed");
    await stream.return?.();
  });
});
