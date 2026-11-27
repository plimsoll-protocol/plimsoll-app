const TEXT_ENTRY_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"]';

interface ShortcutTarget extends EventTarget {
  isContentEditable?: boolean;
  closest?: (selectors: string) => unknown;
}

export interface ShortcutActions {
  focusSearch: () => void;
  toggleTheme: () => void;
  refresh: () => void;
  openCheatsheet: () => void;
  closeCheatsheet: () => void;
  isCheatsheetOpen: () => boolean;
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as ShortcutTarget;
  return (
    element.isContentEditable === true ||
    (typeof element.closest === "function" && element.closest(TEXT_ENTRY_SELECTOR) != null)
  );
}

export function handleGlobalShortcut(
  event: Pick<KeyboardEvent, "key" | "target" | "preventDefault">,
  actions: ShortcutActions,
): boolean {
  if (event.key === "Escape" && actions.isCheatsheetOpen()) {
    event.preventDefault();
    actions.closeCheatsheet();
    return true;
  }
  if (actions.isCheatsheetOpen() || isTextEntryTarget(event.target)) return false;

  const action =
    event.key === "/"
      ? actions.focusSearch
      : event.key === "d"
        ? actions.toggleTheme
        : event.key === "r"
          ? actions.refresh
          : event.key === "?"
            ? actions.openCheatsheet
            : null;

  if (!action) return false;
  event.preventDefault();
  action();
  return true;
}
