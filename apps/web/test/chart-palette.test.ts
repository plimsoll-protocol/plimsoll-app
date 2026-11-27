import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

const CHART_VARS = [
  "--chart-surface",
  "--chart-grid",
  "--chart-axis",
  "--chart-line",
  "--chart-point",
  "--chart-ref",
] as const;

function declarations(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing ${selector} block`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const vars: Record<string, string> = {};
  for (const line of css.slice(open + 1, close).split("\n")) {
    const match = /^\s*(--[\w-]+):\s*(#[0-9a-fA-F]{6});/.exec(line);
    if (match?.[1] && match[2]) vars[match[1]] = match[2];
  }
  return vars;
}

const light = declarations(":root");
const dark = declarations(':root:not([data-theme="light"])');

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each([
  ["light", light],
  ["dark", dark],
])("history chart palette (%s)", (_theme, vars) => {
  it("defines every chart colour", () => {
    for (const name of CHART_VARS) expect(vars[name], name).toBeDefined();
  });

  it("uses a dark chart surface", () => {
    const surface = vars["--chart-surface"];
    expect(surface).toBeDefined();
    const expectedMax = _theme === "dark" ? 0.1 : 1;
    expect(luminance(surface ?? "#ffffff")).toBeLessThanOrEqual(expectedMax);
  });

  it("keeps axis labels at WCAG AA text contrast", () => {
    const surface = vars["--chart-surface"] ?? "";
    expect(contrast(vars["--chart-axis"] ?? "", surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps gridlines, lines and points at WCAG AA non-text contrast", () => {
    const surface = vars["--chart-surface"] ?? "";
    for (const name of ["--chart-grid", "--chart-line", "--chart-point", "--chart-ref"] as const) {
      expect(contrast(vars[name] ?? "", surface), name).toBeGreaterThanOrEqual(3);
    }
  });
});
