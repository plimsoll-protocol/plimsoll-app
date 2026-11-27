/**
 * Persistence for the reporter directory's collapsible filter panel. The
 * panel defaults to open on a desktop-width viewport and closed on a narrower
 * one, unless the visitor has chosen otherwise before.
 */
export const FILTER_PANEL_STORAGE_KEY = "plimsoll:reporters:filters-open";

/** The viewport breakpoint at which the panel opens by default. */
export const DESKTOP_FILTER_QUERY = "(min-width: 768px)";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

/** A stored "true"/"false", or null when nothing usable was stored. */
export function parsePanelPreference(raw: string | null): boolean | null {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

export function readPanelPreference(storage: ReadableStorage | null | undefined): boolean | null {
  if (!storage) return null;
  try {
    return parsePanelPreference(storage.getItem(FILTER_PANEL_STORAGE_KEY));
  } catch {
    // Storage can throw when disabled (private mode, blocked cookies).
    return null;
  }
}

export function writePanelPreference(
  storage: WritableStorage | null | undefined,
  open: boolean,
): void {
  if (!storage) return;
  try {
    storage.setItem(FILTER_PANEL_STORAGE_KEY, String(open));
  } catch {
    // A failed write only costs the preference, never the panel.
  }
}

/** Without a stored choice, the panel is open on desktop and closed on mobile. */
export function defaultPanelOpen(matchesDesktop: boolean): boolean {
  return matchesDesktop;
}
