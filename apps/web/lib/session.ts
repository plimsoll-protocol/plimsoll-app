const STORAGE_KEY = "plimsoll:last-asset";

/** The address of the most recently viewed asset, kept only for this session. */
const session = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export function getLastAsset(): string | null {
  const store = session();
  if (!store) return null;
  try {
    return store.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setLastAsset(sac: string): void {
  const store = session();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, sac);
  } catch {
    // Storage unavailable or full: the app works without restoration.
  }
}

export function clearLastAsset(): void {
  const store = session();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

/** A loader that resolves an asset by its SAC address, or null when absent. */
export type AssetLoader = (sac: string) => Promise<{ sac: string } | null>;

/**
 * Performs the one-time session-restore decision.
 *
 * Reads the last viewed asset from storage, loads it to confirm it still
 * exists, and navigates to its route when it does. When it no longer exists
 * the stored value is cleared so a later reload stops trying. Temporary load
 * failures leave the stored value intact for a future reload.
 *
 * Returns a promise that resolves once the outcome is known. Callers must
 * ensure this runs at most once per page lifetime (e.g. with a guard flag) so
 * restoration does not repeat or loop.
 */
export async function attemptRestore(options: {
  getStored: () => string | null;
  clearStored: () => void;
  loadAsset: AssetLoader;
  navigate: (sac: string) => void;
}): Promise<void> {
  const sac = options.getStored();
  if (!sac) return;

  try {
    const asset = await options.loadAsset(sac);
    if (asset) {
      options.navigate(sac);
    } else {
      options.clearStored();
    }
  } catch {
    // Temporary network failure: keep the stored address so a later reload can
    // try again, and do not break initialization.
  }
}
