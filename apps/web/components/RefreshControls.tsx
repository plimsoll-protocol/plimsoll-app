"use client";

import {
  REFRESH_OPTIONS,
  type RefreshInterval,
} from "@/lib/refresh-interval";

interface RefreshControlsProps {
  interval: RefreshInterval;
  onChange: (v: RefreshInterval) => void;
  onRefresh: () => void;
}

/**
 * A compact row of controls: a labelled select for the auto-refresh interval
 * and a manual refresh button.  Used on data pages that poll live data.
 */
export function RefreshControls({ interval, onChange, onRefresh }: RefreshControlsProps) {
  return (
    <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <label
        style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}
        htmlFor="refresh-interval-select"
      >
        <span className="sub" style={{ whiteSpace: "nowrap" }}>
          Auto-refresh:
        </span>
        <select
          id="refresh-interval-select"
          value={interval}
          onChange={(e) => onChange(e.target.value as RefreshInterval)}
          style={{ fontSize: "0.85rem", padding: "2px 6px" }}
        >
          {REFRESH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="secondary"
        style={{ padding: "2px 10px", fontSize: "0.85rem" }}
        onClick={onRefresh}
        aria-label="Refresh data now"
      >
        Refresh
      </button>
    </div>
  );
}
