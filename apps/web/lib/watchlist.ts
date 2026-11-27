/**
 * Browser-local asset watchlist stored in localStorage.
 *
 * Each watched asset has a threshold (BPS). When coverage is checked and falls
 * below the threshold, the browser Notification API fires an alert. The module
 * never throws: a missing or blocked localStorage / Notification API degrades
 * silently — the page works, it just does not persist or alert.
 */

import type { CoverageStatus } from "@plimsoll/sdk";

export interface WatchedAsset {
  sac: string;
  code: string;
  /** BPS below which a notification is fired (default 10 000). */
  thresholdBps: number;
  addedAt: number;
}

const STORAGE_KEY = "plimsoll:watchlist:v1";

function readStore(): WatchedAsset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWatched);
  } catch {
    return [];
  }
}

function isWatched(v: unknown): v is WatchedAsset {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.sac === "string" &&
    typeof o.code === "string" &&
    typeof o.thresholdBps === "number" &&
    typeof o.addedAt === "number"
  );
}

function writeStore(items: WatchedAsset[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked: silently skip.
  }
}

/** All watched assets for this browser. */
export function listWatched(): WatchedAsset[] {
  return readStore();
}

/** True when the SAC address is on the watchlist. */
export function isWatching(sac: string): boolean {
  return readStore().some((w) => w.sac === sac);
}

/** Add an asset to the watchlist; replaces any existing entry for that SAC. */
export function addWatch(asset: Omit<WatchedAsset, "addedAt">): void {
  const current = readStore().filter((w) => w.sac !== asset.sac);
  writeStore([...current, { ...asset, addedAt: Date.now() }]);
}

/** Remove an asset from the watchlist. */
export function removeWatch(sac: string): void {
  writeStore(readStore().filter((w) => w.sac !== sac));
}

// ---- Notification API -------------------------------------------------------

/** Request Notification permission; resolves to whether permission was granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/** Current browser notification permission state. */
export function notificationPermission(): NotificationPermission | "unavailable" {
  if (typeof Notification === "undefined") return "unavailable";
  return Notification.permission;
}

/**
 * Fire a browser notification when coverage has dropped below the threshold
 * for a watched asset.
 *
 * Does nothing when:
 * - Notification permission is not granted
 * - The status is "covered", "unknown", or "stale" (not conclusively under)
 * - The asset is not on the watchlist or its threshold is not exceeded
 */
export function notifyIfUnder(
  sac: string,
  code: string,
  bps: number | null | undefined,
  status: CoverageStatus,
): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (status !== "under") return;
  if (bps == null) return;

  const watched = readStore().find((w) => w.sac === sac);
  if (!watched) return;
  if (bps >= watched.thresholdBps) return;

  try {
    new Notification(`${code} coverage alert`, {
      body: `${code} coverage is ${(bps / 100).toFixed(2)}% — below your ${(watched.thresholdBps / 100).toFixed(2)}% threshold.`,
      tag: `plimsoll-coverage-${sac}`,
      icon: "/icon.svg",
    });
  } catch {
    // Notification constructor can throw if the browser rate-limits it.
  }
}
