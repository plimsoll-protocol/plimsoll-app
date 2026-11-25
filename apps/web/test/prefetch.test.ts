import { describe, expect, it } from "vitest";
import { PREFETCH_LIMIT, assetDetailHref, injectPrefetchLinks } from "../lib/prefetch";

// ---------------------------------------------------------------------------
// assetDetailHref
// ---------------------------------------------------------------------------

describe("assetDetailHref", () => {
  it("builds an asset detail URL with the SAC encoded", () => {
    expect(assetDetailHref("CABC123", "")).toBe("/asset/?sac=CABC123");
  });

  it("prepends the base path when configured", () => {
    expect(assetDetailHref("CABC123", "/plimsoll-app")).toBe(
      "/plimsoll-app/asset/?sac=CABC123",
    );
  });

  it("strips a trailing slash from the base path", () => {
    expect(assetDetailHref("CABC123", "/plimsoll-app/")).toBe(
      "/plimsoll-app/asset/?sac=CABC123",
    );
  });

  it("percent-encodes special characters in the SAC", () => {
    expect(assetDetailHref("C&weird=sac", "")).toBe("/asset/?sac=C%26weird%3Dsac");
  });
});

// ---------------------------------------------------------------------------
// injectPrefetchLinks
// ---------------------------------------------------------------------------

/** Minimal DOM stub that records what was appended. */
function makeHead() {
  const appended: HTMLLinkElement[] = [];
  const existing = new Set<string>();
  const doc: Parameters<typeof injectPrefetchLinks>[1] = {
    head: {
      appendChild(el: HTMLLinkElement) {
        appended.push(el);
      },
    } as unknown as Document["head"],
    createElement(_tag: string) {
      return {} as HTMLLinkElement;
    },
    querySelector(sel: string) {
      // Extract the href value from the selector to check our set.
      const match = /\[href="([^"]+)"\]/.exec(sel);
      return match && existing.has(match[1] ?? "") ? ({} as Element) : null;
    },
  };
  return { appended, existing, doc };
}

describe("injectPrefetchLinks", () => {
  it("injects one link per SAC", () => {
    const { appended, doc } = makeHead();
    injectPrefetchLinks(["CABC", "CDEF"], doc);
    expect(appended).toHaveLength(2);
    expect(appended[0]).toMatchObject({ rel: "prefetch", as: "document", href: "/asset/?sac=CABC" });
    expect(appended[1]).toMatchObject({ rel: "prefetch", as: "document", href: "/asset/?sac=CDEF" });
  });

  it("caps injection at PREFETCH_LIMIT", () => {
    const { appended, doc } = makeHead();
    const sacs = Array.from({ length: PREFETCH_LIMIT + 5 }, (_, i) => `C${i}`);
    injectPrefetchLinks(sacs, doc);
    expect(appended).toHaveLength(PREFETCH_LIMIT);
  });

  it("returns empty array when given an empty list", () => {
    const { appended, doc } = makeHead();
    const result = injectPrefetchLinks([], doc);
    expect(result).toHaveLength(0);
    expect(appended).toHaveLength(0);
  });

  it("skips SACs whose hint already exists in the document", () => {
    const { appended, existing, doc } = makeHead();
    existing.add("/asset/?sac=CABC");
    injectPrefetchLinks(["CABC", "CDEF"], doc);
    // CABC was already present; only CDEF should be appended.
    expect(appended).toHaveLength(1);
    expect((appended[0] as { href: string }).href).toBe("/asset/?sac=CDEF");
  });

  it("returns the inserted elements", () => {
    const { doc } = makeHead();
    const result = injectPrefetchLinks(["CABC"], doc);
    expect(result).toHaveLength(1);
    expect((result[0] as { href: string }).href).toBe("/asset/?sac=CABC");
  });
});
