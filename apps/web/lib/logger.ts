"use client";

export type LogLevel = "debug" | "log" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  log: 1,
  warn: 2,
  error: 3,
};

function currentLevel(): LogLevel {
  const raw =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_LOG_LEVEL
      ? (process.env.NEXT_PUBLIC_LOG_LEVEL as string)
      : undefined;
  return raw && raw in LEVELS ? (raw as LogLevel) : "warn";
}

const level = currentLevel();

/**
 * Structured logger: the single place in the app that calls `console`.
 * Levels are checked against NEXT_PUBLIC_LOG_LEVEL so debug and log messages
 * stay out of production unless explicitly enabled. Every other module logs
 * through this instead of calling console directly, which lets the `no-console`
 * lint rule keep production code clean.
 */
export const logger = {
  debug: (...args: unknown[]) => {
    if (LEVELS.debug >= LEVELS[level]) console.debug(...args);
  },
  log: (...args: unknown[]) => {
    if (LEVELS.log >= LEVELS[level]) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (LEVELS.warn >= LEVELS[level]) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    if (LEVELS.error >= LEVELS[level]) console.error(...args);
  },
};

export default logger;
