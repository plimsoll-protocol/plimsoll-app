"use client";

import React, { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import {
  type ResolvedTheme,
  type Theme,
  applyTheme,
  getStoredTheme,
  resolveTheme,
  setStoredTheme,
  THEME_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
} from "@/lib/theme";

export interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
});

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);

  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY || e.key === LEGACY_THEME_STORAGE_KEY) {
      notify();
    }
  };
  window.addEventListener("storage", onStorage);

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const onMedia = () => {
    notify();
  };

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener("change", onMedia);
  } else {
    // Legacy browsers
    (mediaQuery as MediaQueryList).addListener(onMedia);
  }

  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
    if (mediaQuery.removeEventListener) {
      mediaQuery.removeEventListener("change", onMedia);
    } else {
      (mediaQuery as MediaQueryList).removeListener(onMedia);
    }
  };
}

function getThemeSnapshot(): Theme {
  return getStoredTheme() ?? "system";
}

function getServerThemeSnapshot(): Theme {
  return "system";
}

function getResolvedSnapshot(): ResolvedTheme {
  return resolveTheme(getThemeSnapshot());
}

function getServerResolvedSnapshot(): ResolvedTheme {
  return "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getServerThemeSnapshot);
  const resolvedTheme = useSyncExternalStore(
    subscribe,
    getResolvedSnapshot,
    getServerResolvedSnapshot,
  );

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = (nextTheme: Theme) => {
    setStoredTheme(nextTheme);
    const nextResolved = resolveTheme(nextTheme);
    applyTheme(nextResolved);
    notify();
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
