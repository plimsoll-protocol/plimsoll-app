import { describe, expect, it } from "vitest";
import type { IndexerReporter } from "@plimsoll/sdk";
import {
  REPORTER_ROLES,
  ROLE_HEADINGS,
  groupReporters,
  isReporterRole,
  reputationOf,
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

describe("reputationOf", () => {
  it("reads a finite score and treats a missing or unusable one as null", () => {
    expect(reputationOf(reporter({ reputation: 42 }))).toBe(42);
    expect(reputationOf(reporter())).toBeNull();
    expect(reputationOf(reporter({ reputation: Number.NaN }))).toBeNull();
  });
});

describe("sortReporters", () => {
  const list = [
    reporter({ address: "GA", name: "Alice", reputation: 10 }),
    reporter({ address: "GB", name: "Bob", reputation: 30 }),
    reporter({ address: "GC", name: "Cara" }),
    reporter({ address: "GD", name: "Dan", reputation: 20 }),
  ];

  it("sorts by reputation both ways and keeps unscored reporters last", () => {
    expect(
      sortReporters(list, { key: "reputation", direction: "desc" }).map((r) => r.address),
    ).toEqual(["GB", "GD", "GA", "GC"]);
    expect(
      sortReporters(list, { key: "reputation", direction: "asc" }).map((r) => r.address),
    ).toEqual(["GA", "GD", "GB", "GC"]);
  });

  it("breaks ties by name, then address", () => {
    const tied = [
      reporter({ address: "GZ", name: "Same", reputation: 5 }),
      reporter({ address: "GA", name: "Same", reputation: 5 }),
      reporter({ address: "GM", name: "Ahead", reputation: 5 }),
    ];
    expect(
      sortReporters(tied, { key: "reputation", direction: "desc" }).map((r) => r.address),
    ).toEqual(["GM", "GA", "GZ"]);
  });

  it("still sorts by name in either direction", () => {
    expect(sortReporters(list, { key: "name", direction: "desc" }).map((r) => r.name)).toEqual([
      "Dan",
      "Cara",
      "Bob",
      "Alice",
    ]);
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
