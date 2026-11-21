// Post-build step: fill the CSP meta tag of every exported page with the
// sha256 of that page's inline scripts. Run by `npm run build` after
// `next build`.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TOKEN = "__INLINE_SCRIPT_HASHES__";

/** CSP hash sources for every inline (no src) <script> in an HTML document. */
export function inlineScriptHashes(html) {
  const hashes = new Set();
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    if (/\ssrc\s*=/i.test(m[1] ?? "")) continue;
    if (m[2] === "") continue;
    hashes.add(`'sha256-${createHash("sha256").update(m[2], "utf8").digest("base64")}'`);
  }
  return [...hashes];
}

/** The page with the token replaced by its script hashes. */
export function applyHashes(html) {
  return html.split(TOKEN).join(inlineScriptHashes(html).join(" "));
}

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith(".html")) yield p;
  }
}

function main() {
  const out = resolve(process.argv[2] ?? "out");
  let pages = 0;
  for (const file of htmlFiles(out)) {
    const html = readFileSync(file, "utf8");
    if (!html.includes(TOKEN)) continue;
    writeFileSync(file, applyHashes(html));
    pages += 1;
  }
  if (pages === 0) throw new Error(`apply-csp: no page in ${out} carries the CSP meta tag`);
  console.log(`apply-csp: wrote script hashes into ${pages} pages`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
