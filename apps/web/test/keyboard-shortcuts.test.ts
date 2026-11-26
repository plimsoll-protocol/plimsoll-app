import { describe, expect, it, vi } from "vitest";
import {
  handleGlobalShortcut,
  isTextEntryTarget,
  type ShortcutActions,
} from "../lib/keyboard-shortcuts";
import { toggleTheme } from "../lib/theme";

function actions(): ShortcutActions {
  return {
    focusSearch: vi.fn(),
    toggleTheme: vi.fn(),
    refresh: vi.fn(),
    openCheatsheet: vi.fn(),
    closeCheatsheet: vi.fn(),
    isCheatsheetOpen: vi.fn(() => false),
  };
}

function keyEvent(key: string, target: EventTarget | null = null) {
  return { key, target, preventDefault: vi.fn() };
}

describe("global keyboard shortcuts", () => {
  it("opens the cheatsheet on ?", () => {
    const callbacks = actions();
    const event = keyEvent("?");
    expect(handleGlobalShortcut(event, callbacks)).toBe(true);
    expect(callbacks.openCheatsheet).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("closes the cheatsheet on Escape", () => {
    const callbacks = actions();
    vi.mocked(callbacks.isCheatsheetOpen).mockReturnValue(true);
    const event = keyEvent("Escape");
    expect(handleGlobalShortcut(event, callbacks)).toBe(true);
    expect(callbacks.closeCheatsheet).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it.each([
    ["/", "focusSearch"],
    ["d", "toggleTheme"],
    ["r", "refresh"],
  ] as const)("runs the %s shortcut", (key, action) => {
    const callbacks = actions();
    const event = keyEvent(key);
    expect(handleGlobalShortcut(event, callbacks)).toBe(true);
    expect(callbacks[action]).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("uses the d shortcut to apply an explicit theme override", () => {
    const root: { dataset: { theme?: string } } = { dataset: {} };
    const callbacks = actions();
    callbacks.toggleTheme = () => {
      toggleTheme(root, false);
    };
    expect(handleGlobalShortcut(keyEvent("d"), callbacks)).toBe(true);
    expect(root.dataset.theme).toBe("dark");
  });

  it("does not handle shortcuts while the cheatsheet is open", () => {
    const callbacks = actions();
    vi.mocked(callbacks.isCheatsheetOpen).mockReturnValue(true);
    const event = keyEvent("d");
    expect(handleGlobalShortcut(event, callbacks)).toBe(false);
    expect(callbacks.toggleTheme).not.toHaveBeenCalled();
  });

  it("ignores text-entry controls and contenteditable targets", () => {
    const input = Object.assign(new EventTarget(), {
      closest: vi.fn(() => ({})),
    });
    const editable = Object.assign(new EventTarget(), { isContentEditable: true });
    expect(isTextEntryTarget(input)).toBe(true);
    expect(isTextEntryTarget(editable)).toBe(true);

    const callbacks = actions();
    for (const target of [input, editable]) {
      const event = keyEvent("?", target);
      expect(handleGlobalShortcut(event, callbacks)).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(callbacks.openCheatsheet).not.toHaveBeenCalled();
  });

  it("toggles between system preference and the opposite explicit theme", () => {
    const root: { dataset: { theme?: string } } = { dataset: {} };
    expect(toggleTheme(root, false)).toBe("dark");
    expect(toggleTheme(root, false)).toBe("light");
    delete root.dataset.theme;
    expect(toggleTheme(root, true)).toBe("light");
  });
});
