"use client";

import React from "react";
import { useTheme } from "./ThemeProvider";
import type { Theme } from "@/lib/theme";

function SunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

const THEME_OPTIONS: { id: Theme; label: string; icon: typeof SystemIcon }[] = [
  { id: "system", label: "System", icon: SystemIcon },
  { id: "light", label: "Light", icon: SunIcon },
  { id: "dark", label: "Dark", icon: MoonIcon },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIndex = (index + 1) % THEME_OPTIONS.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIndex = (index - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length;
    }
    if (nextIndex >= 0) {
      e.preventDefault();
      const nextOption = THEME_OPTIONS[nextIndex];
      if (nextOption) {
        setTheme(nextOption.id);
        const container = (e.currentTarget as HTMLElement).parentElement;
        const targetBtn = container?.querySelectorAll<HTMLButtonElement>("button")[nextIndex];
        targetBtn?.focus();
      }
    }
  };

  return (
    <div
      className="theme-toggle"
      role="radiogroup"
      aria-label="Theme preference"
    >
      {THEME_OPTIONS.map((opt, i) => {
        const Icon = opt.icon;
        const isSelected = theme === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            className={`theme-option ${isSelected ? "active" : ""}`}
            onClick={() => setTheme(opt.id)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            title={`${opt.label} theme`}
            aria-label={`${opt.label} theme`}
          >
            <Icon />
            <span className="theme-label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
