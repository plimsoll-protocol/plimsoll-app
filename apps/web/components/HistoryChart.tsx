"use client";

function bpsPct(bps: number, decimals = 2): string {
  return `${(bps / 100).toFixed(decimals)}%`;
}

export interface HistoryPoint {
  /** Unix seconds (UTC). */
  t: number;
  bps: number;
}

const W = 640;
const H = 200;
const PAD = { top: 16, right: 16, bottom: 40, left: 52 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

function formatUtcDate(epochSecs: number): string {
  const d = new Date(epochSecs * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

function formatUtcFull(epochSecs: number): string {
  return new Date(epochSecs * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function HistoryChart({ points }: { points: HistoryPoint[] }) {
  if (points.length === 0) return null;

  const minT = points[0]!.t;
  const maxT = points[points.length - 1]!.t;
  const maxBps = Math.max(...points.map((p) => p.bps), 10_000);
  const cappedMax = Math.min(maxBps, 15_000);

  const xOf = (t: number) =>
    maxT === minT ? PAD.left + INNER_W / 2 : PAD.left + ((t - minT) / (maxT - minT)) * INNER_W;

  const yOf = (bps: number) =>
    PAD.top + INNER_H - (Math.min(bps, cappedMax) / cappedMax) * INNER_H;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.t).toFixed(1)},${yOf(p.bps).toFixed(1)}`)
    .join(" ");

  const areaD =
    pathD +
    ` L${xOf(maxT).toFixed(1)},${(PAD.top + INNER_H).toFixed(1)} L${xOf(minT).toFixed(1)},${(PAD.top + INNER_H).toFixed(1)} Z`;

  // Y axis ticks: 0%, 50%, 100%
  const yTicks = [0, 5000, 10000];

  // X axis ticks: up to 5 evenly spaced
  const tickCount = Math.min(points.length, 5);
  const xTickIndices =
    tickCount <= 1
      ? [0]
      : Array.from({ length: tickCount }, (_, i) =>
          Math.round((i / (tickCount - 1)) * (points.length - 1)),
        );

  return (
    <div className="history-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label="Coverage history chart (UTC)"
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--sea)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--sea)" stopOpacity="0.03" />
          </linearGradient>
          <clipPath id="chart-clip">
            <rect x={PAD.left} y={PAD.top} width={INNER_W} height={INNER_H} />
          </clipPath>
        </defs>

        {/* Y grid lines + labels */}
        {yTicks.map((bps) => {
          const y = yOf(bps).toFixed(1);
          return (
            <g key={bps}>
              <line
                x1={PAD.left}
                y1={y}
                x2={PAD.left + INNER_W}
                y2={y}
                stroke="var(--line)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="11"
                fill="var(--ink-3)"
              >
                {bpsPct(bps, 0)}
              </text>
            </g>
          );
        })}

        {/* 100% backed reference line */}
        <line
          x1={PAD.left}
          y1={yOf(10_000).toFixed(1)}
          x2={PAD.left + INNER_W}
          y2={yOf(10_000).toFixed(1)}
          stroke="var(--ok)"
          strokeWidth="1"
          strokeDasharray="4 3"
          opacity="0.6"
        />

        {/* Area fill */}
        <path d={areaD} fill="url(#chart-fill)" clipPath="url(#chart-clip)" />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke="var(--sea)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          clipPath="url(#chart-clip)"
        />

        {/* Data points */}
        {points.map((p) => (
          <circle
            key={p.t}
            cx={xOf(p.t).toFixed(1)}
            cy={yOf(p.bps).toFixed(1)}
            r="3"
            fill="var(--sea)"
          >
            <title>
              {formatUtcFull(p.t)}: {bpsPct(p.bps)}
            </title>
          </circle>
        ))}

        {/* X axis ticks */}
        {xTickIndices.map((idx) => {
          const p = points[idx]!;
          const x = xOf(p.t).toFixed(1);
          return (
            <text
              key={idx}
              x={x}
              y={PAD.top + INNER_H + 16}
              textAnchor="middle"
              fontSize="11"
              fill="var(--ink-3)"
            >
              {formatUtcDate(p.t)}
            </text>
          );
        })}

        {/* X axis label — UTC marker */}
        <text
          x={PAD.left + INNER_W}
          y={PAD.top + INNER_H + 32}
          textAnchor="end"
          fontSize="10"
          fill="var(--ink-3)"
        >
          UTC
        </text>

        {/* Axes */}
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={PAD.top + INNER_H}
          stroke="var(--line)"
          strokeWidth="1"
        />
        <line
          x1={PAD.left}
          y1={PAD.top + INNER_H}
          x2={PAD.left + INNER_W}
          y2={PAD.top + INNER_H}
          stroke="var(--line)"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
