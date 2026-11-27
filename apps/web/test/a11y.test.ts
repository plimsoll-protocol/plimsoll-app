import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ReportersPage from "../app/reporters/page";

// WCAG relative luminance and contrast ratio calculations
function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (rs ?? 0) + 0.7152 * (gs ?? 0) + 0.0722 * (bs ?? 0);
}

function contrastRatio(hex1: string, hex2: string): number {
  const parseHex = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  };
  const [r1, g1, b1] = parseHex(hex1);
  const [r2, g2, b2] = parseHex(hex2);
  const l1 = relativeLuminance(r1, g1, b1);
  const l2 = relativeLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Accessibility - Color Contrast", () => {
  it("light mode ink-3 meets WCAG AA 4.5:1 contrast against both surface (#ffffff) and paper (#f5f3ee)", () => {
    const ink3Light = "#606b76";
    const surfaceLight = "#ffffff";
    const paperLight = "#f5f3ee";

    const vsSurface = contrastRatio(ink3Light, surfaceLight);
    const vsPaper = contrastRatio(ink3Light, paperLight);

    expect(vsSurface).toBeGreaterThanOrEqual(4.5);
    expect(vsPaper).toBeGreaterThanOrEqual(4.5);
  });

  it("dark mode ink-3 meets WCAG AA 4.5:1 contrast against dark surface (#142230) and dark paper (#0d1620)", () => {
    const ink3Dark = "#8696a6";
    const surfaceDark = "#142230";
    const paperDark = "#0d1620";

    const vsSurface = contrastRatio(ink3Dark, surfaceDark);
    const vsPaper = contrastRatio(ink3Dark, paperDark);

    expect(vsSurface).toBeGreaterThanOrEqual(4.5);
    expect(vsPaper).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Accessibility - ARIA & Semantic Structure", () => {
  it("reporters loading skeleton uses role=status without prohibited aria-label on generic elements", () => {
    const html = renderToStaticMarkup(createElement(ReportersPage));

    // Must use role="status" for the loading region
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading reporters");
    // Should not have prohibited aria-label on generic <div>
    expect(html).not.toContain('<div class="mt" aria-busy="true" aria-label="Loading reporters">');
  });
});
