import { describe, expect, it } from "vitest";
import type { IndexerReporter } from "@plimsoll/sdk";
import {
  DEFAULT_REPORTER_SORT,
  REPORTER_ROLES,
  REPORTER_SORTS,
  ROLE_HEADINGS,
  activeFilterCount,
  filterReporters,
  groupReporters,
  isReporterRole,
  isReporterSort,
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

  it("orders each role with the chosen sort", () => {
    const list = [
      reporter({ address: "GC", name: "Alice", updated_at: "2026-01-01T00:00:00Z" }),
      reporter({ address: "GE", name: "Carol", updated_at: "2026-03-01T00:00:00Z" }),
      reporter({ address: "GF", name: "bob", updated_at: "2026-02-01T00:00:00Z" }),
    ];
    const names = (sort: (typeof REPORTER_SORTS)[number]) =>
      groupReporters(list, sort)
        .find((g) => g.role === "auditor")
        ?.reporters.map((r) => r.name);

    expect(names(DEFAULT_REPORTER_SORT)).toEqual(["Alice", "bob", "Carol"]);
    expect(names("name-desc")).toEqual(["Carol", "bob", "Alice"]);
    expect(names("recent")).toEqual(["Carol", "bob", "Alice"]);
  });

  it("puts reporters with no usable update time last", () => {
    const groups = groupReporters(
      [
        reporter({ address: "GC", name: "Alice", updated_at: "" }),
        reporter({ address: "GE", name: "Carol", updated_at: "2026-03-01T00:00:00Z" }),
      ],
      "recent",
    );
    expect(groups.find((g) => g.role === "auditor")?.reporters.map((r) => r.name)).toEqual([
      "Carol",
      "Alice",
    ]);
  });
});

describe("filterReporters", () => {
  const list = [
    reporter({ address: "GALICE", name: "Alice Audit" }),
    reporter({ address: "GZOE", name: "Zoe Transcribe" }),
  ];

  it("matches a name or address case-insensitively", () => {
    expect(filterReporters(list, "alice").map((r) => r.name)).toEqual(["Alice Audit"]);
    expect(filterReporters(list, "gzoe").map((r) => r.name)).toEqual(["Zoe Transcribe"]);
  });

  it("ignores surrounding whitespace and keeps everyone for an empty query", () => {
    expect(filterReporters(list, "  ").map((r) => r.name)).toEqual([
      "Alice Audit",
      "Zoe Transcribe",
    ]);
    expect(filterReporters(list, "  zoe  ").map((r) => r.name)).toEqual(["Zoe Transcribe"]);
  });

  it("returns nothing when no reporter matches", () => {
    expect(filterReporters(list, "nobody")).toEqual([]);
  });
});

describe("activeFilterCount", () => {
  it("counts a non-empty search and a non-default sort", () => {
    expect(activeFilterCount("", DEFAULT_REPORTER_SORT)).toBe(0);
    expect(activeFilterCount("   ", DEFAULT_REPORTER_SORT)).toBe(0);
    expect(activeFilterCount("alice", DEFAULT_REPORTER_SORT)).toBe(1);
    expect(activeFilterCount("", "recent")).toBe(1);
    expect(activeFilterCount("alice", "name-desc")).toBe(2);
  });
});

describe("isReporterSort", () => {
  it("accepts only the three supported orders", () => {
    expect(REPORTER_SORTS.every(isReporterSort)).toBe(true);
    expect(isReporterSort("recently-updated")).toBe(false);
    expect(isReporterSort("")).toBe(false);
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
