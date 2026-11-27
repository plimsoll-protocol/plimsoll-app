export interface ThemeRoot {
  dataset: {
    theme?: string;
  };
}

export function toggleTheme(root: ThemeRoot, prefersDark: boolean): "dark" | "light" {
  const current = root.dataset.theme ?? (prefersDark ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  return next;
}

export type Theme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "plimsoll:theme";
export const LEGACY_THEME_STORAGE_KEY = "theme";

export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#f5f3ee",
  dark: "#0d1620",
};

/**
 * Inline blocking script injected into <head> to prevent Flash of Unstyled/Wrong Theme (FOUC).
 * Runs synchronously before first paint in static export.
 */
export const THEME_SCRIPT = `(function() {
  try {
    var stored = null;
    try {
      stored = localStorage.getItem("${THEME_STORAGE_KEY}") || localStorage.getItem("${LEGACY_THEME_STORAGE_KEY}");
    } catch (e) {}
    var theme = (stored === "light" || stored === "dark") ? stored : null;
    if (!theme) {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    var root = document.documentElement;
    root.setAttribute("data-theme", theme);
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    root.style.colorScheme = theme;
    var color = theme === "dark" ? "${THEME_COLORS.dark}" : "${THEME_COLORS.light}";
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    if (metas.length > 0) {
      metas[0].setAttribute("content", color);
      metas[0].removeAttribute("media");
      for (var i = 1; i < metas.length; i++) {
        var el = metas[i];
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
    } else {
      var meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      meta.setAttribute("content", color);
      (document.head || root).appendChild(meta);
    }
  } catch (e) {}
})();`;

/**
 * Retrieve the stored theme preference from localStorage.
 * Returns null if not stored or if localStorage is inaccessible.
 */
export function getStoredTheme(storage?: Pick<Storage, "getItem">): Theme | null {
  try {
    const s = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!s) return null;
    const value = s.getItem(THEME_STORAGE_KEY) ?? s.getItem(LEGACY_THEME_STORAGE_KEY);
    if (value === "system" || value === "light" || value === "dark") {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save the user's theme preference to localStorage.
 * Handles storage quota/security restrictions gracefully.
 */
export function setStoredTheme(theme: Theme, storage?: Pick<Storage, "setItem">): void {
  try {
    const s = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!s) return;
    s.setItem(THEME_STORAGE_KEY, theme);
    s.setItem(LEGACY_THEME_STORAGE_KEY, theme);
  } catch {
    // quota exceeded or SSR / restricted storage — silently ignore
  }
}

/**
 * Check system preference via matchMedia.
 */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Resolve "system" | "light" | "dark" to actual "light" | "dark".
 */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") {
    return getSystemTheme();
  }
  return theme;
}

/**
 * Update the <meta name="theme-color"> element to match the resolved theme.
 */
export function updateThemeColor(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const color = THEME_COLORS[resolved];
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (metas.length > 0) {
    metas[0]!.setAttribute("content", color);
    metas[0]!.removeAttribute("media");
    for (let i = 1; i < metas.length; i++) {
      const el = metas[i];
      if (el) {
        if (typeof el.remove === "function") {
          el.remove();
        } else if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      }
    }
  } else {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", color);
    (document.head ?? document.documentElement).appendChild(meta);
  }
}

/**
 * Apply the resolved theme to the document: data-theme attribute, dark class, color-scheme, and theme-color meta tag.
 */
export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  root.style.colorScheme = resolved;
  updateThemeColor(resolved);
}
