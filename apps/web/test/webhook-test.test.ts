import { describe, expect, it, vi } from "vitest";
import { IndexerAbortError, IndexerClient, IndexerError } from "@plimsoll/sdk";
import {
  buttonLabel,
  noticeFor,
  runWebhookTest,
  stateFromError,
  stateFromResult,
} from "@/lib/webhook-test";

describe("stateFromResult", () => {
  it("treats a 2xx receiver status as delivered", () => {
    for (const status of [200, 201, 202, 204, 299]) {
      expect(stateFromResult({ status }), String(status)).toEqual({ kind: "ok", status });
    }
  });

  it("treats other receiver statuses as a receiver error, carrying the status", () => {
    for (const status of [301, 400, 404, 410, 500, 503, 599]) {
      expect(stateFromResult({ status }), String(status)).toEqual({
        kind: "receiver_error",
        status,
      });
    }
  });

  it("does not guess when the answer has no usable status", () => {
    for (const bad of [null, undefined, {}, { status: "200" }, { status: 99 }, { status: 600 }]) {
      expect(stateFromResult(bad), JSON.stringify(bad)).toMatchObject({ kind: "err" });
    }
    expect(stateFromResult({ status: 200.5 })).toMatchObject({ kind: "err" });
    expect(stateFromResult({ status: Number.NaN })).toMatchObject({ kind: "err" });
  });
});

describe("stateFromError", () => {
  const message = (err: unknown) => {
    const state = stateFromError(err);
    expect(state.kind).toBe("err");
    return state.kind === "err" ? state.message : "";
  };

  it("explains a 404 as an indexer that cannot do this", () => {
    expect(message(new IndexerError(404, "not found"))).toMatch(/not support test payloads/i);
  });

  it("explains the one-a-minute limit on a 429", () => {
    expect(message(new IndexerError(429, "slow down"))).toMatch(/once a minute/i);
  });

  it("explains an authorisation refusal on 401 and 403", () => {
    for (const status of [401, 403]) {
      expect(message(new IndexerError(status, "denied")), String(status)).toMatch(
        /not authorised/i,
      );
    }
  });

  it("shows the indexer's own words for other HTTP errors", () => {
    expect(message(new IndexerError(500, "boom"))).toContain("boom");
    expect(message(new IndexerError(502, "bad gateway"))).toContain("bad gateway");
  });

  it("explains timeouts and cancellations", () => {
    expect(message(new IndexerAbortError("timeout", "t"))).toMatch(/timed out/i);
    expect(message(new IndexerAbortError("aborted", "a"))).toMatch(/cancelled/i);
  });

  it("explains a network failure without leaking its internals", () => {
    const text = message(new TypeError("fetch failed: ECONNRESET 10.0.0.1"));
    expect(text).toMatch(/could not reach the indexer/i);
    expect(text).not.toContain("ECONNRESET");
    expect(message("something odd")).toMatch(/could not reach the indexer/i);
  });
});

describe("runWebhookTest", () => {
  it("calls testWebhook with the webhook id and returns the state", async () => {
    const testWebhook = vi.fn(async () => ({ status: 200 }));
    await expect(runWebhookTest({ testWebhook }, "wh-1")).resolves.toEqual({
      kind: "ok",
      status: 200,
    });
    expect(testWebhook).toHaveBeenCalledWith("wh-1");
  });

  it("shows a receiver's failure as such, not as an indexer failure", async () => {
    const testWebhook = vi.fn(async () => ({ status: 500 }));
    await expect(runWebhookTest({ testWebhook }, "wh-1")).resolves.toEqual({
      kind: "receiver_error",
      status: 500,
    });
  });

  it("never throws: a failed call becomes an error state", async () => {
    const testWebhook = vi.fn(async () => {
      throw new IndexerError(429, "rate limited");
    });
    const state = await runWebhookTest({ testWebhook }, "wh-1");
    expect(state.kind).toBe("err");
  });
});

describe("noticeFor and buttonLabel", () => {
  it("shows nothing while idle or in flight", () => {
    expect(noticeFor(undefined)).toBeNull();
    expect(noticeFor({ kind: "busy" })).toBeNull();
  });

  it("shows the receiver's status on success and on a receiver error", () => {
    expect(noticeFor({ kind: "ok", status: 204 })).toEqual({
      tone: "ok",
      text: "Test payload delivered. The receiver responded 204.",
    });
    expect(noticeFor({ kind: "receiver_error", status: 503 })).toEqual({
      tone: "bad",
      text: "Test payload sent, but the receiver responded 503.",
    });
  });

  it("shows an error message as a bad notice", () => {
    expect(noticeFor({ kind: "err", message: "nope" })).toEqual({ tone: "bad", text: "nope" });
  });

  it("labels the button by what it does, and says when it is working", () => {
    expect(buttonLabel(undefined)).toBe("Send test payload");
    expect(buttonLabel({ kind: "ok", status: 200 })).toBe("Send test payload");
    expect(buttonLabel({ kind: "err", message: "x" })).toBe("Send test payload");
    expect(buttonLabel({ kind: "busy" })).toBe("Sending…");
  });
});

describe("IndexerClient.testWebhook", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("POSTs the webhook id to /v1/webhooks/test and returns the status", async () => {
    const f = vi.fn(async () => json({ status: 200 }));
    const client = new IndexerClient("http://indexer.test/", f as unknown as typeof fetch);
    await expect(client.testWebhook("wh-1")).resolves.toEqual({ status: 200 });

    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://indexer.test/v1/webhooks/test");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ id: "wh-1" });
  });

  it("rejects with the indexer's status and message on failure", async () => {
    const f = vi.fn(async () => json({ error: "rate limited" }, 429));
    const client = new IndexerClient("http://indexer.test", f as unknown as typeof fetch);
    const error = await client.testWebhook("wh-1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IndexerError);
    expect((error as IndexerError).status).toBe(429);
    expect((error as IndexerError).message).toBe("rate limited");
  });

  it("end to end: a 429 from the indexer becomes the one-a-minute message", async () => {
    const f = vi.fn(async () => json({ error: "rate limited" }, 429));
    const client = new IndexerClient("http://indexer.test", f as unknown as typeof fetch);
    const state = await runWebhookTest(client, "wh-1");
    expect(noticeFor(state)?.text).toMatch(/once a minute/i);
  });
});
