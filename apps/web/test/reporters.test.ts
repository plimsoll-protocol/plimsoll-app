import { describe, expect, it } from "vitest";
import type { IndexerReporter } from "@plimsoll/sdk";
import {
  REPORTER_ROLES,
  ROLE_HEADINGS,
  groupReporters,
  isReporterRole,
  reputationOf,
  reputationText,
  sortReporters,
  updatedAt,
} from "../lib/reporters";

const reporter = (over: Partial<IndexerReporter> = {}): IndexerReporter => ({
  address: "GA",
  role: "auditor",
  name: "Alice Audit",
  updated_at: "2026-01-02T00:00:00Z",
  ...over,
});

describe("groupReporters", () => {
  it("returns every role in a fixed order, including empty ones", () => {
    const groups = groupReporters([]);
    expect(groups.map((g) => g.role)).toEqual([...REPORTER_ROLES]);
    expect(groups.every((g) => g.reporters.length === 0)).toBe(true);
    for (const group of groups) expect(group.heading).toBe(ROLE_HEADINGS[group.role]);
  });

  it("puts each reporter under its own role and sorts by name, then address", () => {
    const groups = groupReporters([
      reporter({ address: "GB", name: "bob Transcriber", role: "transcriber" }),
      reporter({ address: "GD", name: "Dana Poster", role: "supply_poster" }),
      reporter({ address: "GC", name: "Alice Audit", role: "auditor" }),
      reporter({ address: "GE", name: "alice Audit", role: "auditor" }),
      reporter({ address: "GF", name: "Alice Audit", role: "auditor" }),
    ]);
    const byRole = Object.fromEntries(groups.map((g) => [g.role, g.reporters]));

    expect(byRole.auditor?.map((r) => r.address)).toEqual(["GC", "GE", "GF"]);
    expect(byRole.transcriber?.map((r) => r.address)).toEqual(["GB"]);
    expect(byRole.supply_poster?.map((r) => r.address)).toEqual(["GD"]);
  });

  it("skips a role this build does not know", () => {
    const groups = groupReporters([
      reporter({ address: "GX", role: "oracle" as IndexerReporter["role"] }),
      reporter({ address: "GY" }),
    ]);
    expect(groups.flatMap((g) => g.reporters).map((r) => r.address)).toEqual(["GY"]);
  });
});

describe("sortReporters", () => {
  const listed = () => [
    reporter({ address: "GA", name: "Alice", reputation: 40 }),
    reporter({ address: "GB", name: "Bob", reputation: 90 }),
    reporter({ address: "GC", name: "Cara" }),
    reporter({ address: "GD", name: "Dan", reputation: 40 }),
  ];

  it("sorts reputation high to low, with unscored reporters last", () => {
    const out = sortReporters(listed(), "reputation", "desc");
    expect(out.map((r) => r.address)).toEqual(["GB", "GA", "GD", "GC"]);
  });

  it("sorts reputation low to high, still keeping unscored reporters last", () => {
    const out = sortReporters(listed(), "reputation", "asc");
    expect(out.map((r) => r.address)).toEqual(["GA", "GD", "GB", "GC"]);
  });

  it("treats a non-numeric score as unavailable", () => {
    const out = sortReporters(
      [
        reporter({ address: "GA", name: "Alice", reputation: Number.NaN }),
        reporter({ address: "GB", name: "Bob", reputation: 5 }),
      ],
      "reputation",
      "desc",
    );
    expect(out.map((r) => r.address)).toEqual(["GB", "GA"]);
  });

  it("sorts names in either direction without changing the input", () => {
    const input = listed();
    expect(sortReporters(input, "name", "asc").map((r) => r.name)).toEqual([
      "Alice",
      "Bob",
      "Cara",
      "Dan",
    ]);
    expect(sortReporters(input, "name", "desc").map((r) => r.name)).toEqual([
      "Dan",
      "Cara",
      "Bob",
      "Alice",
    ]);
    expect(input.map((r) => r.name)).toEqual(["Alice", "Bob", "Cara", "Dan"]);
  });
});

describe("reputation display", () => {
  it("reads a finite score and marks a missing one as unknown", () => {
    expect(reputationOf(reporter({ reputation: 0 }))).toBe(0);
    expect(reputationOf(reporter())).toBeNull();
    expect(reputationOf(reporter({ reputation: Number.POSITIVE_INFINITY }))).toBeNull();
    expect(reputationText(reporter({ reputation: 12 }))).toBe("12");
    expect(reputationText(reporter())).toBe("—");
  });
});

describe("isReporterRole", () => {
  it("accepts only the three registry roles", () => {
    expect(REPORTER_ROLES.every(isReporterRole)).toBe(true);
    expect(isReporterRole("issuer")).toBe(false);
    expect(isReporterRole("")).toBe(false);
  });
});

describe("updatedAt", () => {
  it("parses an ISO timestamp to unix seconds and keeps the original", () => {
    expect(updatedAt("2026-01-02T00:00:00Z")).toEqual({
      iso: "2026-01-02T00:00:00Z",
      epoch: Date.parse("2026-01-02T00:00:00Z") / 1000,
    });
  });

  it("returns null for missing, empty or unparseable values", () => {
    expect(updatedAt(undefined)).toBeNull();
    expect(updatedAt("")).toBeNull();
    expect(updatedAt("not a date")).toBeNull();
  });
});
