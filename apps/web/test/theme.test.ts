import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "../components/ThemeToggle";
import {
  LEGACY_THEME_STORAGE_KEY,
  THEME_COLORS,
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  getStoredTheme,
  getSystemTheme,
  resolveTheme,
  setStoredTheme,
  updateThemeColor,
} from "../lib/theme";

// In-memory mock storage
function makeMockStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => {
      store.set(key, String(val));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}

// Minimal DOM mock for Node/Vitest environment
interface MockElement {
  nodeName: string;
  attributes: Record<string, string>;
  classList: {
    add: (cls: string) => void;
    remove: (cls: string) => void;
    contains: (cls: string) => boolean;
    toggle: (cls: string, force?: boolean) => boolean;
  };
  style: Record<string, string>;
  children: MockElement[];
  parentNode: MockElement | null;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  appendChild: (child: MockElement) => MockElement;
  removeChild: (child: MockElement) => MockElement;
  remove: () => void;
}

function createMockElement(nodeName: string): MockElement {
  const attributes: Record<string, string> = {};
  const classes = new Set<string>();
  const style: Record<string, string> = {};
  const children: MockElement[] = [];

  const el: MockElement = {
    nodeName: nodeName.toUpperCase(),
    attributes,
    classList: {
      add: (cls) => classes.add(cls),
      remove: (cls) => classes.delete(cls),
      contains: (cls) => classes.has(cls),
      toggle: (cls, force) => {
        const next = force !== undefined ? force : !classes.has(cls);
        if (next) classes.add(cls);
        else classes.delete(cls);
        return next;
      },
    },
    style,
    children,
    parentNode: null,
    getAttribute: (name) => attributes[name.toLowerCase()] ?? null,
    setAttribute: (name, val) => {
      attributes[name.toLowerCase()] = String(val);
      if (name.toLowerCase() === "class") {
        classes.clear();
        String(val).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
      }
    },
    removeAttribute: (name) => {
      delete attributes[name.toLowerCase()];
    },
    appendChild: (child) => {
      child.parentNode = el;
      children.push(child);
      return child;
    },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    remove: () => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    },
  };

  return el;
}

function setupMockDom() {
  const docElement = createMockElement("html");
  const head = createMockElement("head");
  const body = createMockElement("body");
  docElement.appendChild(head);
  docElement.appendChild(body);

  const mockDoc = {
    documentElement: docElement,
    head,
    body,
    createElement: (tag: string) => createMockElement(tag),
    querySelectorAll: (selector: string): MockElement[] => {
      const results: MockElement[] = [];
      const traverse = (node: MockElement) => {
        if (selector === 'meta[name="theme-color"]') {
          if (
            node.nodeName === "META" &&
            node.getAttribute("name")?.toLowerCase() === "theme-color"
          ) {
            results.push(node);
          }
        }
        for (const child of node.children) {
          traverse(child);
        }
      };
      traverse(docElement);
      return results;
    },
    querySelector: (selector: string): MockElement | null => {
      const list = mockDoc.querySelectorAll(selector);
      return list[0] ?? null;
    },
  };

  return { mockDoc, docElement, head };
}

describe("theme storage and persistence", () => {
  it("returns null when no theme is stored", () => {
    const storage = makeMockStorage();
    expect(getStoredTheme(storage)).toBeNull();
  });

  it("reads valid themes from storage", () => {
    const s1 = makeMockStorage({ [THEME_STORAGE_KEY]: "dark" });
    expect(getStoredTheme(s1)).toBe("dark");

    const s2 = makeMockStorage({ [LEGACY_THEME_STORAGE_KEY]: "light" });
    expect(getStoredTheme(s2)).toBe("light");

    const s3 = makeMockStorage({ [THEME_STORAGE_KEY]: "system" });
    expect(getStoredTheme(s3)).toBe("system");
  });

  it("ignores unknown or corrupted values in storage", () => {
    const storage = makeMockStorage({ [THEME_STORAGE_KEY]: "neon-rainbow" });
    expect(getStoredTheme(storage)).toBeNull();
  });

  it("handles storage exceptions gracefully", () => {
    const brokenStorage = {
      getItem: () => {
        throw new Error("QuotaExceeded or SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded or SecurityError");
      },
    } as unknown as Storage;

    expect(() => getStoredTheme(brokenStorage)).not.toThrow();
    expect(getStoredTheme(brokenStorage)).toBeNull();
    expect(() => setStoredTheme("dark", brokenStorage)).not.toThrow();
  });

  it("saves theme choice to both keys for compatibility", () => {
    const storage = makeMockStorage();
    setStoredTheme("dark", storage);
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(storage.getItem(LEGACY_THEME_STORAGE_KEY)).toBe("dark");
  });
});

describe("theme resolution", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves explicit light and dark directly", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolves system theme based on matchMedia dark mode", () => {
    const matchMediaDark = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("window", { matchMedia: matchMediaDark });
    expect(getSystemTheme()).toBe("dark");
    expect(resolveTheme("system")).toBe("dark");
    expect(matchMediaDark).toHaveBeenCalledWith("(prefers-color-scheme: dark)");

    const matchMediaLight = vi.fn().mockReturnValue({ matches: false });
    vi.stubGlobal("window", { matchMedia: matchMediaLight });
    expect(getSystemTheme()).toBe("light");
    expect(resolveTheme("system")).toBe("light");
  });

  it("falls back to light when window or matchMedia is missing", () => {
    vi.stubGlobal("window", {});
    expect(getSystemTheme()).toBe("light");
    expect(resolveTheme("system")).toBe("light");
  });
});

describe("applyTheme and updateThemeColor", () => {
  let mockDoc: ReturnType<typeof setupMockDom>["mockDoc"];
  let docElement: ReturnType<typeof setupMockDom>["docElement"];
  let head: ReturnType<typeof setupMockDom>["head"];

  beforeEach(() => {
    const dom = setupMockDom();
    mockDoc = dom.mockDoc;
    docElement = dom.docElement;
    head = dom.head;
    vi.stubGlobal("document", mockDoc);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies dark theme cleanly to document and updates meta theme-color", () => {
    applyTheme("dark");

    expect(docElement.getAttribute("data-theme")).toBe("dark");
    expect(docElement.classList.contains("dark")).toBe(true);
    expect(docElement.style["colorScheme"]).toBe("dark");

    const meta = mockDoc.querySelector('meta[name="theme-color"]');
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute("content")).toBe(THEME_COLORS.dark);
    expect(meta?.getAttribute("media")).toBeNull();
  });

  it("applies light theme cleanly to document and updates meta theme-color", () => {
    // Pre-populate with dark
    docElement.setAttribute("data-theme", "dark");
    docElement.classList.add("dark");

    applyTheme("light");

    expect(docElement.getAttribute("data-theme")).toBe("light");
    expect(docElement.classList.contains("dark")).toBe(false);
    expect(docElement.style["colorScheme"]).toBe("light");

    const meta = mockDoc.querySelector('meta[name="theme-color"]');
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute("content")).toBe(THEME_COLORS.light);
  });

  it("removes duplicate theme-color meta tags and strips media query constraints", () => {
    const meta1 = mockDoc.createElement("meta");
    meta1.setAttribute("name", "theme-color");
    meta1.setAttribute("media", "(prefers-color-scheme: light)");
    meta1.setAttribute("content", "#f5f3ee");
    head.appendChild(meta1);

    const meta2 = mockDoc.createElement("meta");
    meta2.setAttribute("name", "theme-color");
    meta2.setAttribute("media", "(prefers-color-scheme: dark)");
    meta2.setAttribute("content", "#0d1620");
    head.appendChild(meta2);

    expect(mockDoc.querySelectorAll('meta[name="theme-color"]').length).toBe(2);

    updateThemeColor("dark");

    const metas = mockDoc.querySelectorAll('meta[name="theme-color"]');
    expect(metas.length).toBe(1);
    expect(metas[0]?.getAttribute("content")).toBe(THEME_COLORS.dark);
    expect(metas[0]?.getAttribute("media")).toBeNull();
  });
});

describe("no-flash pre-paint script (THEME_SCRIPT)", () => {
  let mockDoc: ReturnType<typeof setupMockDom>["mockDoc"];
  let docElement: ReturnType<typeof setupMockDom>["docElement"];

  beforeEach(() => {
    const dom = setupMockDom();
    mockDoc = dom.mockDoc;
    docElement = dom.docElement;
    vi.stubGlobal("document", mockDoc);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("immediately applies dark theme when stored preference is dark", () => {
    const storage = makeMockStorage({ [THEME_STORAGE_KEY]: "dark" });
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
    });

    // Execute the blocking inline script string
    new Function(THEME_SCRIPT)();

    expect(docElement.getAttribute("data-theme")).toBe("dark");
    expect(docElement.classList.contains("dark")).toBe(true);
    expect(docElement.style["colorScheme"]).toBe("dark");
    const meta = mockDoc.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute("content")).toBe(THEME_COLORS.dark);
  });

  it("immediately applies light theme when stored preference is light", () => {
    const storage = makeMockStorage({ [THEME_STORAGE_KEY]: "light" });
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }), // System is dark, but user chose light
    });

    new Function(THEME_SCRIPT)();

    expect(docElement.getAttribute("data-theme")).toBe("light");
    expect(docElement.classList.contains("dark")).toBe(false);
    expect(docElement.style["colorScheme"]).toBe("light");
    const meta = mockDoc.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute("content")).toBe(THEME_COLORS.light);
  });

  it("resolves against matchMedia when stored preference is system or absent", () => {
    const storage = makeMockStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockImplementation((q: string) => ({
        matches: q.includes("dark"),
      })),
    });

    new Function(THEME_SCRIPT)();

    expect(docElement.getAttribute("data-theme")).toBe("dark");
    expect(docElement.classList.contains("dark")).toBe(true);
  });

  it("does not throw if localStorage access is denied or disabled", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("Access denied");
      },
    });
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
    });

    expect(() => new Function(THEME_SCRIPT)()).not.toThrow();
    expect(docElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("ThemeToggle component", () => {
  it("renders a radiogroup with system, light, and dark options", () => {
    const html = renderToStaticMarkup(createElement(ThemeToggle));

    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Theme preference"');

    // System option
    expect(html).toContain('title="System theme"');
    expect(html).toContain('aria-label="System theme"');
    expect(html).toContain("System</span>");

    // Light option
    expect(html).toContain('title="Light theme"');
    expect(html).toContain('aria-label="Light theme"');
    expect(html).toContain("Light</span>");

    // Dark option
    expect(html).toContain('title="Dark theme"');
    expect(html).toContain('aria-label="Dark theme"');
    expect(html).toContain("Dark</span>");
  });

  it("has exactly one active option with aria-checked=true and active class", () => {
    const html = renderToStaticMarkup(createElement(ThemeToggle));

    // By default in SSR without provider override, "system" is selected
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('class="theme-option active"');
  });
});
