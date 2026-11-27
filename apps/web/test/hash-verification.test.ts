import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  HashVerificationStatus,
  hashVerificationCopy,
  type HashVerificationState,
} from "../components/HashVerificationStatus";

const JARGON_PATTERN =
  /\b(doc_uri|doc_hash|soroban|scval|bytesn|sac|ledger state|smart contract)\b/i;

describe("hashVerificationCopy", () => {
  it("provides plain-language copy for pending, verified, and failed states", () => {
    const states: HashVerificationState[] = [
      { kind: "pending" },
      { kind: "pending", checking: true },
      { kind: "verified" },
      { kind: "failed", reason: "mismatch", message: "hash does not match" },
      { kind: "failed", reason: "fetch", message: "could not fetch (CORS?)" },
    ];

    for (const state of states) {
      const copy = hashVerificationCopy(state);
      expect(copy.label.length).toBeGreaterThan(0);
      expect(copy.ariaLabel.length).toBeGreaterThan(0);
      expect(copy.tooltip.length).toBeGreaterThan(0);
      expect(copy.tooltip).not.toMatch(JARGON_PATTERN);
    }
  });

  it("explains why a failed verification is concerning", () => {
    const mismatch = hashVerificationCopy({ kind: "failed", reason: "mismatch" });
    expect(mismatch.tooltip.toLowerCase()).toContain("concerning");
    expect(mismatch.tooltip.toLowerCase()).toContain("tampered");

    const fetchFail = hashVerificationCopy({ kind: "failed", reason: "fetch" });
    expect(fetchFail.tooltip.toLowerCase()).toContain("caution");
    expect(fetchFail.tooltip.toLowerCase()).toContain("altered");
  });
});

describe("HashVerificationStatus", () => {
  it.each<[HashVerificationState, string]>([
    [{ kind: "pending" }, "Document verification status: not yet checked"],
    [{ kind: "verified" }, "Document verification status: verified"],
    [{ kind: "failed", reason: "mismatch" }, "Document verification status: failed"],
  ])("renders an accessible button and tooltip for %o", (state, expectedAriaLabel) => {
    const html = renderToStaticMarkup(createElement(HashVerificationStatus, { state }));
    expect(html).toContain('type="button"');
    expect(html).toContain(`aria-label="${expectedAriaLabel}"`);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('aria-hidden="true"');

    const describedByMatch = html.match(/aria-describedby="([^"]+)"/);
    const tooltipIdMatch = html.match(/id="([^"]+)"[^>]*role="tooltip"/);
    expect(describedByMatch?.[1]).toBeTruthy();
    expect(describedByMatch?.[1]).toBe(tooltipIdMatch?.[1]);
    expect(html).toContain(hashVerificationCopy(state).tooltip);
  });
});
