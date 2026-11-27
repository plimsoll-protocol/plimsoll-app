import { describe, expect, it } from "vitest";
import {
  DOC_URI_MAX_BYTES,
  validateDocUri,
  type ValidationResult,
} from "../src/index";

describe("validateDocUri", () => {
  it("accepts an https document link", () => {
    expect(validateDocUri("https://example.com/reserves/2026-10.pdf")).toEqual({
      valid: true,
      uri: "https://example.com/reserves/2026-10.pdf",
      scheme: "https",
    });
  });

  it("accepts an ipfs document link", () => {
    expect(validateDocUri("ipfs://bafybeigdyrzt")).toEqual({
      valid: true,
      uri: "ipfs://bafybeigdyrzt",
      scheme: "ipfs",
    });
  });

  it("treats the scheme case-insensitively and returns the trimmed URI", () => {
    expect(validateDocUri("  HTTPS://example.com/a.pdf  ")).toEqual({
      valid: true,
      uri: "HTTPS://example.com/a.pdf",
      scheme: "https",
    });
  });

  it.each(["", "   "])("rejects an empty URI (%j)", (uri) => {
    const result = validateDocUri(uri);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("empty");
  });

  it.each([
    "http://example.com/a.pdf",
    "ftp://example.com/a.pdf",
    "example.com/a.pdf",
    "javascript://example.com",
  ])("rejects the unsupported scheme in %s", (uri) => {
    const result = validateDocUri(uri);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("unsupported_scheme");
  });

  it("rejects a scheme with no document path", () => {
    const result = validateDocUri("https://");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("missing_target");
  });

  it("accepts a URI of exactly the contract's maximum byte length", () => {
    const uri = "https://" + "a".repeat(DOC_URI_MAX_BYTES - "https://".length);
    expect(new TextEncoder().encode(uri).length).toBe(DOC_URI_MAX_BYTES);
    expect(validateDocUri(uri).valid).toBe(true);
  });

  it("rejects a URI over the contract's maximum byte length", () => {
    const uri = "https://" + "a".repeat(DOC_URI_MAX_BYTES);
    const result = validateDocUri(uri);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("too_long");
  });

  it("counts UTF-8 bytes, not UTF-16 code units", () => {
    // 255 ASCII bytes plus a three-byte character lands above the limit even
    // though the string has fewer than 256 JavaScript characters.
    const uri = "https://" + "a".repeat(DOC_URI_MAX_BYTES - "https://".length - 1) + "€";
    expect(uri.length).toBeLessThanOrEqual(DOC_URI_MAX_BYTES);
    const result = validateDocUri(uri);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("too_long");
  });

  it("returns a discriminated ValidationResult", () => {
    const result: ValidationResult = validateDocUri("https://example.com/a");
    if (result.valid) {
      expect(result.scheme).toBe("https");
    } else {
      throw new Error(`expected a valid result, got ${result.code}`);
    }
  });
});
