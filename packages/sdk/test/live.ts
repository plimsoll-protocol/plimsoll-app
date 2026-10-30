import type { TestContext } from "vitest";

/**
 * Node's fetch gives up on a connection after 10 seconds, well inside these
 * suites' own timeout, and reports it as a bare `TypeError: fetch failed` with
 * the real reason on `cause`.
 */
const UNREACHABLE = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ENETUNREACH",
]);

function unreachableReason(err: unknown): string | null {
  for (let e: unknown = err, depth = 0; e instanceof Error && depth < 4; depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && UNREACHABLE.has(code)) return code;
    if (e.name === "AbortError" || e.name === "TimeoutError") return e.name;
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs a read against a live network, retrying a connection that never
 * established.
 *
 * A third party we cannot reach says nothing about this code, so when every
 * attempt fails to connect the test is skipped rather than failed: CI should go
 * red for a wrong answer, not for someone else's outage. A host that does
 * answer, wrongly, still fails the assertions that follow.
 */
export async function live<T>(ctx: TestContext, read: () => Promise<T>, attempts = 3): Promise<T> {
  let reason = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await read();
    } catch (err) {
      const unreachable = unreachableReason(err);
      if (unreachable === null) throw err;
      reason = unreachable;
      if (attempt < attempts) await wait(attempt * 1_000);
    }
  }
  ctx.skip(`network unreachable after ${attempts} attempts (${reason})`);
  throw new Error("unreachable: ctx.skip() ends the test");
}
