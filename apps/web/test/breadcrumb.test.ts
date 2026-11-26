import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Breadcrumb } from "../components/Breadcrumb";

describe("Breadcrumb", () => {
  it("labels the trail and links every level above the current page", () => {
    const html = renderToStaticMarkup(
      createElement(Breadcrumb, {
        items: [
          { label: "Home", href: "/" },
          { label: "Assets", href: "/" },
          { label: "PUSD" },
        ],
      }),
    );
    expect(html).toContain('aria-label="breadcrumb"');
    expect(html).toContain('<a href="/">Home</a>');
    expect(html).toContain('<a href="/">Assets</a>');
  });

  it("renders the current page as plain text, not a link", () => {
    const html = renderToStaticMarkup(
      createElement(Breadcrumb, {
        items: [
          { label: "Home", href: "/" },
          { label: "Reporters" },
        ],
      }),
    );
    expect(html).toContain('<span aria-current="page">Reporters</span>');
    expect(html).not.toContain('href="/reporters"');
    expect(html).not.toContain("<a>Reporters</a>");
  });

  it("adds a collapsed marker only when there are middle levels to hide", () => {
    const two = renderToStaticMarkup(
      createElement(Breadcrumb, {
        items: [
          { label: "Home", href: "/" },
          { label: "Reporters" },
        ],
      }),
    );
    const four = renderToStaticMarkup(
      createElement(Breadcrumb, {
        items: [
          { label: "Home", href: "/" },
          { label: "Assets", href: "/" },
          { label: "PUSD", href: "/asset/?sac=C" },
          { label: "Certificate" },
        ],
      }),
    );
    expect(two).not.toContain("crumb-gap");
    expect(four).toContain('class="crumb-gap"');
    expect(four).toContain('<a href="/asset?sac=C">PUSD</a>');
  });
});
