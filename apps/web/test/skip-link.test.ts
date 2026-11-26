import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RootLayout from "../app/layout";
import NotFound from "../app/not-found";

// Every route (including the 404 and error pages) renders inside the root layout, so these
// checks cover the skip link on every page.
const page = (child: React.ReactNode) =>
  renderToStaticMarkup(createElement(RootLayout, null, child));

const body = (html: string) => html.slice(html.indexOf("<body"));

// Opening tags of elements that are in the tab order, in document order.
function focusableTags(html: string): string[] {
  const tag =
    /<(a|button|input|select|textarea|summary|iframe)\b[^>]*>|<[a-z]+\b[^>]*\btabindex="\d+"[^>]*>/gi;
  return [...html.matchAll(tag)]
    .map((m) => m[0])
    .filter((t) => !/^<a\b/i.test(t) || /\shref=/i.test(t))
    .filter((t) => !/\sdisabled(=|\s|>)/i.test(t) && !/\stype="hidden"/i.test(t))
    .filter((t) => !/\stabindex="-1"/i.test(t));
}

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/** Declarations of the top-level rule whose selector list is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "m").exec(css);
  if (!m?.[1]) throw new Error(`no ${selector} rule in globals.css`);
  return m[1];
}

describe("skip to main content link", () => {
  const html = page(createElement("p", null, "Page body"));

  it("is the first focusable element on the page", () => {
    const [first] = focusableTags(body(html));
    expect(first).toBeDefined();
    expect(first).toContain('class="skip-link"');
    expect(first).toContain('href="#main-content"');
  });

  it("comes before the header and its navigation", () => {
    const b = body(html);
    expect(b.indexOf('class="skip-link"')).toBeGreaterThan(-1);
    expect(b.indexOf('class="skip-link"')).toBeLessThan(b.indexOf("<header"));
    expect(b.indexOf('class="skip-link"')).toBeLessThan(b.indexOf("<nav"));
  });

  it("is announced as 'Skip to main content'", () => {
    expect(html).toMatch(/<a href="#main-content" class="skip-link">Skip to main content<\/a>/);
  });

  it("is rendered once per page", () => {
    expect(html.match(/class="skip-link"/g)).toHaveLength(1);
  });

  it("targets a single main landmark that can take focus", () => {
    expect(html.match(/id="main-content"/g)).toHaveLength(1);
    expect(html).toMatch(/<main id="main-content" tabindex="-1">/);
    expect(html.match(/<main\b/g)).toHaveLength(1);
  });

  it("wraps the page content in the target", () => {
    const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    expect(main).toContain("Page body");
  });

  it("is present on the not-found page too", () => {
    const missing = page(createElement(NotFound));
    expect(focusableTags(body(missing))[0]).toContain('class="skip-link"');
    expect(missing.match(/id="main-content"/g)).toHaveLength(1);
    expect(missing).toContain("Page not found");
  });
});

describe("skip link styles", () => {
  it("hides the link off-screen without removing it from the tab order", () => {
    const hidden = rule(".skip-link");
    expect(hidden).toMatch(/position:\s*absolute/);
    expect(hidden).toMatch(/top:\s*-100%/);
    expect(hidden).not.toMatch(/display:\s*none/);
    expect(hidden).not.toMatch(/visibility:\s*hidden/);
  });

  it("moves the link on screen, above the header, when it has focus", () => {
    expect(rule(".skip-link")).toMatch(/z-index:\s*\d{2,}/);
    expect(rule(".skip-link:focus")).toMatch(/top:\s*\d+px/);
  });

  it("uses theme colours so it works in light and dark mode", () => {
    const hidden = rule(".skip-link");
    expect(hidden).toMatch(/background:\s*var\(--surface\)/);
    expect(hidden).toMatch(/color:\s*var\(--sea\)/);
  });

  it("does not draw a focus ring on main when focus moves there", () => {
    expect(rule("main")).toMatch(/outline:\s*none/);
  });
});
