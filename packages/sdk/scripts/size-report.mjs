// Turns `size-limit --json` output into the markdown the CI job posts on a pull
// request and writes to the job summary. Kept free of I/O so it can be tested.

/** Marks the comment so a later run updates it instead of adding another. */
export const COMMENT_MARKER = "<!-- plimsoll-bundle-size -->";

const KB = 1000;

/** Bytes as a short human figure, e.g. 9790 -> "9.79 kB". */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes < KB) return `${bytes} B`;
  return `${(bytes / KB).toFixed(2)} kB`;
}

/**
 * Reads size-limit's JSON. Returns the entries, or null when the text is not
 * the expected array (for example when the build did not run and size-limit
 * printed an error instead).
 */
export function parseResults(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const valid = parsed.every(
    (entry) =>
      entry !== null &&
      typeof entry === "object" &&
      typeof entry.name === "string" &&
      // size-limit reports a missing file as size 0 and "passed"; that is a
      // failure to measure, not a tiny bundle.
      Number.isFinite(entry.size) &&
      entry.size > 0,
  );
  return valid ? parsed : null;
}

/** True when every entry is within its limit. */
export function allPassed(results) {
  return results !== null && results.every((entry) => entry.passed !== false);
}

/** The markdown comment body, starting with the marker. */
export function renderReport(results) {
  if (results === null) {
    return [
      COMMENT_MARKER,
      "### SDK bundle size",
      "",
      "Could not measure the bundle: `size-limit` did not produce a result. Check the **bundle size** job log.",
      "",
    ].join("\n");
  }
  const rows = results.map((entry) => {
    const limit = Number.isFinite(entry.sizeLimit) ? formatBytes(entry.sizeLimit) : "none";
    const state = entry.passed === false ? "over the limit" : "within the limit";
    const used =
      Number.isFinite(entry.sizeLimit) && entry.sizeLimit > 0
        ? ` (${((entry.size / entry.sizeLimit) * 100).toFixed(1)}% of the limit)`
        : "";
    return `| ${entry.name} | ${formatBytes(entry.size)}${used} | ${limit} | ${state} |`;
  });
  return [
    COMMENT_MARKER,
    `### SDK bundle size: ${allPassed(results) ? "within the limit" : "over the limit"}`,
    "",
    "| Bundle | Size (gzip) | Limit | Result |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

// Run as a script: node size-report.mjs <size-limit.json>  ->  markdown on stdout.
// Exits 1 when a bundle is over its limit or could not be measured.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let text = "";
  try {
    text = readFileSync(process.argv[2] ?? "", "utf8");
  } catch {
    text = "";
  }
  const results = parseResults(text);
  process.stdout.write(renderReport(results));
  process.exitCode = allPassed(results) ? 0 : 1;
}
