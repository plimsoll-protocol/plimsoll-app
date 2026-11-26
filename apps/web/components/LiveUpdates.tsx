"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeCoverageEvents } from "@plimsoll/sdk";
import { config } from "@/lib/config";

/** A supply post and its coverage change arrive together; refresh once. */
const REFRESH_DEBOUNCE_MS = 1_000;

/**
 * Keeps the coverage-event stream for one asset open, refreshes the page when
 * an event lands, and says so when the stream drops.
 *
 * The banner is deliberately shown only for a stream that has been up and then
 * lost its connection. An indexer that does not serve the stream at all — an
 * older deployment, or a CORS rejection — never opens, so nothing was paused
 * and a banner claiming to reconnect for ever would be an inaccurate alarm.
 */
export function LiveUpdates({ sac, onRefresh }: { sac: string; onRefresh: () => void }) {
  const [paused, setPaused] = useState(false);
  const refresh = useRef(onRefresh);

  useEffect(() => {
    refresh.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!config.indexerUrl || !sac) return;
    let live = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const subscription = subscribeCoverageEvents(
      config.indexerUrl,
      sac,
      () => {
        if (timer !== null) return;
        timer = setTimeout(() => {
          timer = null;
          refresh.current();
        }, REFRESH_DEBOUNCE_MS);
      },
      {
        onStateChange: (state) => {
          if (state === "live") {
            live = true;
            setPaused(false);
          } else if (state === "paused" && live) {
            setPaused(true);
          }
        },
      },
    );

    return () => {
      if (timer !== null) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [sac]);

  return (
    <div aria-live="polite" role="status" className={paused ? "live-banner" : undefined}>
      {paused ? "Live updates paused — reconnecting…" : null}
    </div>
  );
}
