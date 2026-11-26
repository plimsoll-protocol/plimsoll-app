import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  COMMENT_MARKER,
  allPassed,
  formatBytes,
  parseResults,
  renderReport,
} from "../scripts/size-report.mjs";

const ENTRY = {
  name: "@plimsoll/sdk (ESM, gzip)",
  passed: true,
  size: 9790,
  sizeLimit: 50_000,
};

describe("formatBytes", () => {
  it("shows bytes under a kilobyte and kilobytes above", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1000)).toBe("1.00 kB");
    expect(formatBytes(9790)).toBe("9.79 kB");
    expect(formatBytes(50_000)).toBe("50.00 kB");
  });

  it("does not print nonsense for a bad figure", () => {
    for (const bad of [Number.NaN, Infinity, -1]) {
      expect(formatBytes(bad), String(bad)).toBe("unknown");
    }
  });
});

describe("parseResults", () => {
  it("reads size-limit's JSON array", () => {
    expect(parseResults(JSON.stringify([ENTRY]))).toEqual([ENTRY]);
  });

  it("returns null for anything that is not a usable result", () => {
    for (const bad of [
      "",
      "not json",
      "{}",
      "[]",
      "null",
      JSON.stringify([{ name: "x" }]),
      JSON.stringify([{ size: 1 }]),
      JSON.stringify([ENTRY, null]),
      JSON.stringify([{ name: "x", size: "10" }]),
      // size-limit says "passed" with size 0 when the build output is missing.
      JSON.stringify([{ name: "x", size: 0, sizeLimit: 50_000, passed: true }]),
      JSON.stringify([{ name: "x", size: -5 }]),
    ]) {
      expect(parseResults(bad), bad).toBeNull();
    }
  });
});

describe("allPassed", () => {
  it("is true only when every entry is within its limit", () => {
    expect(allPassed([ENTRY])).toBe(true);
    expect(allPassed([ENTRY, { ...ENTRY, passed: false }])).toBe(false);
  });

  it("treats an unmeasured bundle as not passed", () => {
    expect(allPassed(null)).toBe(false);
  });
});

describe("renderReport", () => {
  it("starts with the marker so a later run can find and update the comment", () => {
    expect(renderReport([ENTRY]).startsWith(COMMENT_MARKER)).toBe(true);
    expect(renderReport(null).startsWith(COMMENT_MARKER)).toBe(true);
  });

  it("shows the size, the limit and how much of it is used", () => {
    const text = renderReport([ENTRY]);
    expect(text).toContain("SDK bundle size: within the limit");
    expect(text).toContain(
      "| @plimsoll/sdk (ESM, gzip) | 9.79 kB (19.6% of the limit) | 50.00 kB |",
    );
    expect(text).toContain("within the limit |");
  });

  it("says plainly when the limit is exceeded", () => {
    const text = renderReport([{ ...ENTRY, size: 51_000, passed: false }]);
    expect(text).toContain("SDK bundle size: over the limit");
    expect(text).toContain("over the limit |");
    expect(text).toContain("102.0% of the limit");
  });

  it("copes with an entry that has no limit", () => {
    const text = renderReport([{ name: "bare", size: 500 }]);
    expect(text).toContain("| bare | 500 B | none |");
    expect(text).not.toContain("% of the limit");
  });

  it("says it could not measure when there is no result", () => {
    const text = renderReport(null);
    expect(text).toContain("Could not measure the bundle");
    expect(text).not.toContain("| --- |");
  });
});

describe("the size-limit config", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    scripts: Record<string, string>;
    "size-limit"?: Array<{ path: string; limit: string; gzip?: boolean }>;
  };

  it("limits the built ESM bundle to 50 kB gzipped", () => {
    expect(pkg["size-limit"]).toEqual([
      expect.objectContaining({ path: "dist/index.js", gzip: true }),
    ]);
    expect(pkg["size-limit"]?.[0]?.limit).toMatch(/^50 k?B$/i);
  });

  it("has a size script that runs size-limit", () => {
    expect(pkg.scripts["size"]).toBe("size-limit");
  });
});
