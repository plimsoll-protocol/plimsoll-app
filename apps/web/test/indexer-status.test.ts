import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IndexerClient } from "@plimsoll/sdk";
import { ChainFallbackNotice } from "../app/page";
import { Footer, IndexerStatusIndicator } from "../components/SiteChrome";
import { config } from "../lib/config";
import { loadIndexerStatus, type IndexerStatus } from "../lib/data";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const ORIGINAL_INDEXER_URL = config.indexerUrl;

beforeEach(() => {
  config.indexerUrl = "https://indexer.example.com";
});

afterEach(() => {
  config.indexerUrl = ORIGINAL_INDEXER_URL;
  vi.restoreAllMocks();
});

describe("loadIndexerStatus", () => {
  it("makes no network request when no indexer URL is configured", async () => {
    config.indexerUrl = "";
    const fetchSpy = vi.fn();
    const result = await loadIndexerStatus(null);
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns ok state when indexer is healthy and caught up", async () => {
    const fetchFn = vi.fn(async () => json({ status: "ok", ingested_to_ledger: 100 }));
    const client = new IndexerClient("https://indexer.example.com", fetchFn as unknown as typeof fetch);

    const status = await loadIndexerStatus(client);
    expect(status).toMatchObject({
      state: "ok",
      health: { status: "ok", ingested_to_ledger: 100 },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((fetchFn.mock.calls[0] as unknown[])[0]).toBe("https://indexer.example.com/healthz");
  });

  it("returns lagging state with age from lag_seconds", async () => {
    const fetchFn = vi.fn(async () =>
      json({
        status: "lagging",
        lag_seconds: 300,
      }),
    );
    const client = new IndexerClient("https://indexer.example.com", fetchFn as unknown as typeof fetch);

    const status = await loadIndexerStatus(client);
    expect(status).toMatchObject({
      state: "lagging",
      lastEventAgeSeconds: 300,
    });
  });

  it("returns lagging state with age calculated from last_event_at ISO date", async () => {
    const nowSecs = 1700000300;
    const lastEventAt = new Date((nowSecs - 600) * 1000).toISOString();
    const fetchFn = vi.fn(async () =>
      json({
        status: "lagging",
        last_event_at: lastEventAt,
      }),
    );
    const client = new IndexerClient("https://indexer.example.com", fetchFn as unknown as typeof fetch);

    const status = await loadIndexerStatus(client, nowSecs);
    expect(status).toMatchObject({
      state: "lagging",
      lastEventAgeSeconds: 600,
    });
  });

  it("returns unreachable state when health request fails or times out", async () => {
    const fetchFn = vi.fn(async () => json({ error: "server error" }, 503));
    const client = new IndexerClient("https://indexer.example.com", fetchFn as unknown as typeof fetch);

    const status = await loadIndexerStatus(client);
    expect(status).toEqual({ state: "unreachable" });
  });

  it("returns unreachable state when fetch throws a network exception", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("Network offline");
    });
    const client = new IndexerClient("https://indexer.example.com", fetchFn as unknown as typeof fetch);

    const status = await loadIndexerStatus(client);
    expect(status).toEqual({ state: "unreachable" });
  });
});

describe("Footer indexer status indicator", () => {
  it("renders ok state with healthy indicator in footer", () => {
    const status: IndexerStatus = { state: "ok", health: { status: "ok" } };
    const html = renderToStaticMarkup(createElement(Footer, { status }));

    expect(html).toContain("indexer-status");
    expect(html).toContain("data-status=\"ok\"");
    expect(html).toContain("status-dot-ok");
    expect(html).toContain("Indexer: healthy");
  });

  it("renders lagging state with human-readable last event age", () => {
    const status: IndexerStatus = {
      state: "lagging",
      lastEventAgeSeconds: 300,
      health: { status: "lagging", lag_seconds: 300 },
    };
    const html = renderToStaticMarkup(createElement(Footer, { status }));

    expect(html).toContain("data-status=\"lagging\"");
    expect(html).toContain("status-dot-lagging");
    expect(html).toContain("Indexer: lagging (last event 5 minutes ago)");
  });

  it("renders unreachable state when indexer is unavailable", () => {
    const status: IndexerStatus = { state: "unreachable" };
    const html = renderToStaticMarkup(createElement(Footer, { status }));

    expect(html).toContain("data-status=\"unreachable\"");
    expect(html).toContain("status-dot-unreachable");
    expect(html).toContain("Indexer: unreachable");
  });

  it("renders nothing for indicator and triggers no network calls when indexer is not configured", () => {
    config.indexerUrl = "";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const html = renderToStaticMarkup(createElement(IndexerStatusIndicator, { status: null }));
    expect(html).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Dashboard chain fallback notice", () => {
  it("renders notice explaining that fallback list read from chain may be incomplete", () => {
    const html = renderToStaticMarkup(
      createElement(ChainFallbackNotice, { networkName: "testnet" }),
    );

    expect(html).toContain("notice-warn");
    expect(html).toContain("Reading directly from on-chain storage on testnet");
    expect(html).toContain("This fallback list may not include every listed asset (may be incomplete)");
  });
});
