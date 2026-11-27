import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_AGE_SECONDS,
  DEFAULT_MIN_BPS,
  bpsToPercent,
  type CoverageStatus,
} from "@plimsoll/sdk";
import { CoverageLegend, StatusPill, statusExplanation } from "../components/ui";

const DOCS_URL =
  "https://plimsoll-protocol.gitbook.io/plimsoll-protocol-docs/protocol/coverage-math";
const STATUSES: CoverageStatus[] = ["covered", "under", "stale", "unknown"];
const minimum = bpsToPercent(DEFAULT_MIN_BPS) ?? "100%";
const maxAge = `${DEFAULT_MAX_AGE_SECONDS / 86_400} days`;

describe("statusExplanation", () => {
  it("states the ratio and freshness rules from the SDK", () => {
    for (const status of ["covered", "under", "stale"] as const) {
      expect(statusExplanation(status)).toContain(minimum);
      expect(statusExplanation(status)).toContain(maxAge);
    }
  });

  it("says what unknown means", () => {
    expect(statusExplanation("unknown")).toContain("no ratio");
  });
});

describe("StatusPill", () => {
  it("puts the rule inside a keyboard-and-touch-operable details element", () => {
    const html = renderToStaticMarkup(createElement(StatusPill, { status: "stale" }));
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain(statusExplanation("stale"));
    expect(html).toContain(DOCS_URL);
  });
});

describe("CoverageLegend", () => {
  it("lists every status with its explanation and a docs link", () => {
    const html = renderToStaticMarkup(createElement(CoverageLegend));
    for (const status of STATUSES) {
      expect(html).toContain(statusExplanation(status));
    }
    expect(html).toContain(DOCS_URL);
  });
});
