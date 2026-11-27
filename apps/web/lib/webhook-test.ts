/**
 * State and wording for the "Send test payload" button on the webhook
 * settings page. Kept out of the component so every outcome can be tested.
 */

import { IndexerAbortError, IndexerError } from "@plimsoll/sdk";
import type { IndexerClient } from "@plimsoll/sdk";

/** Where one webhook's test stands. Absent from the map means "not tested". */
export type WebhookTestState =
  /** The request is in flight; the button is disabled. */
  | { kind: "busy" }
  /** The receiver answered with a 2xx status. */
  | { kind: "ok"; status: number }
  /** The indexer reached the receiver, which answered with a non-2xx status. */
  | { kind: "receiver_error"; status: number }
  /** The test could not be run or the indexer refused it. */
  | { kind: "err"; message: string };

/** Message and how to present it. `null` when there is nothing to show. */
export interface WebhookTestNotice {
  tone: "ok" | "bad";
  text: string;
}

/** Turns the indexer's answer into a state. */
export function stateFromResult(result: unknown): WebhookTestState {
  const status = (result as { status?: unknown } | null)?.status;
  if (typeof status !== "number" || !Number.isInteger(status) || status < 100 || status > 599) {
    return { kind: "err", message: "The indexer answered, but did not report a response status." };
  }
  return status >= 200 && status < 300
    ? { kind: "ok", status }
    : { kind: "receiver_error", status };
}

/** Turns a failed call into a state with a message a person can act on. */
export function stateFromError(err: unknown): WebhookTestState {
  if (err instanceof IndexerAbortError) {
    return {
      kind: "err",
      message:
        err.reason === "timeout"
          ? "The test timed out. The receiver may be slow or unreachable."
          : "The test was cancelled.",
    };
  }
  if (err instanceof IndexerError) {
    switch (err.status) {
      case 404:
        return {
          kind: "err",
          message:
            "This indexer cannot send test payloads for this webhook. It may not support test payloads yet.",
        };
      case 429:
        return {
          kind: "err",
          message: "A test can be sent once a minute for each webhook. Try again shortly.",
        };
      case 401:
      case 403:
        return { kind: "err", message: "The indexer refused the request: not authorised." };
      default:
        return { kind: "err", message: `The indexer could not send the test: ${err.message}` };
    }
  }
  return { kind: "err", message: "Could not reach the indexer. Check your connection and retry." };
}

/** Runs one test and always resolves with the state to show; it never throws. */
export async function runWebhookTest(
  client: Pick<IndexerClient, "testWebhook">,
  id: string,
): Promise<WebhookTestState> {
  try {
    return stateFromResult(await client.testWebhook(id));
  } catch (err) {
    return stateFromError(err);
  }
}

/** The message under a webhook's row, or `null` while idle or in flight. */
export function noticeFor(state: WebhookTestState | undefined): WebhookTestNotice | null {
  if (!state || state.kind === "busy") return null;
  switch (state.kind) {
    case "ok":
      return {
        tone: "ok",
        text: `Test payload delivered. The receiver responded ${state.status}.`,
      };
    case "receiver_error":
      return {
        tone: "bad",
        text: `Test payload sent, but the receiver responded ${state.status}.`,
      };
    case "err":
      return { tone: "bad", text: state.message };
  }
}

/** The button label: names the action, or says it is working. */
export function buttonLabel(state: WebhookTestState | undefined): string {
  return state?.kind === "busy" ? "Sending…" : "Send test payload";
}
