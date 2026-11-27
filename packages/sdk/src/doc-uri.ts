/**
 * The `doc_uri` rules the coverage ledger applies when it accepts a reserve
 * report. The contract rejects an empty or over-long URI (`InvalidUri`); the
 * app additionally requires one of the schemes below so the link the UI hands
 * to a wallet can actually be opened.
 *
 * Keep this file as the single source of truth: the Report page runs
 * `validateDocUri` before asking a wallet to sign.
 */

/** Schemes a reserve document may use. */
export const DOC_URI_SCHEMES = ["https", "ipfs"] as const;

/** Shortest accepted URI, in UTF-8 bytes. Mirrors the contract's non-empty check. */
export const DOC_URI_MIN_BYTES = 1;

/** Longest accepted URI, in UTF-8 bytes. Mirrors `MAX_URI_LEN` in the ledger. */
export const DOC_URI_MAX_BYTES = 256;

export type DocUriScheme = (typeof DOC_URI_SCHEMES)[number];

export type DocUriErrorCode =
  | "empty"
  | "too_long"
  | "unsupported_scheme"
  | "missing_target";

/** The result of checking a document URI. Never a bare boolean. */
export type ValidationResult =
  | { valid: true; uri: string; scheme: DocUriScheme }
  | { valid: false; code: DocUriErrorCode; message: string };

const URI_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i;

/**
 * Checks a `doc_uri` against the rules the ledger enforces and the schemes the
 * app supports. Surrounding whitespace is ignored and the accepted URI is
 * returned trimmed, because the trimmed string is what should be submitted.
 */
export function validateDocUri(uri: string): ValidationResult {
  const clean = uri.trim();
  if (clean.length === 0) {
    return { valid: false, code: "empty", message: "Enter a document URI." };
  }

  // The contract measures the Soroban string in bytes, so count UTF-8 bytes
  // rather than JavaScript UTF-16 code units.
  const bytes = new TextEncoder().encode(clean).length;
  if (bytes < DOC_URI_MIN_BYTES) {
    return { valid: false, code: "empty", message: "Enter a document URI." };
  }
  if (bytes > DOC_URI_MAX_BYTES) {
    return {
      valid: false,
      code: "too_long",
      message: `The document URI must be at most ${DOC_URI_MAX_BYTES} bytes.`,
    };
  }

  const match = URI_PATTERN.exec(clean);
  const scheme = match?.[1]?.toLowerCase();
  if (!scheme || !(DOC_URI_SCHEMES as readonly string[]).includes(scheme)) {
    return {
      valid: false,
      code: "unsupported_scheme",
      message: `Use a ${DOC_URI_SCHEMES.join(":// or ")}:// URI.`,
    };
  }

  if (!match?.[2]) {
    return {
      valid: false,
      code: "missing_target",
      message: "The URI needs a document path after the scheme.",
    };
  }

  return { valid: true, uri: clean, scheme: scheme as DocUriScheme };
}
