import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Role, Tier, type CoverageLedgerFns } from "../src/index";

describe("ABI codegen", () => {
  it("matches committed generated types", () => {
    const script = path.resolve(__dirname, "..", "scripts", "codegen-abi.mjs");
    const out = execFileSync(process.execPath, [script, "--check"], { encoding: "utf8" });
    expect(out).toContain("up to date");
  });

  it("exports generated enums and contract function types", () => {
    expect(Tier.Transcribed).toBe(1);
    expect(Tier.IssuerSigned).toBe(2);
    expect(Tier.AuditorSigned).toBe(3);
    expect(Role.Auditor).toBe(1);
    expect(Role.Watcher).toBe(4);

    // Compile-time check for generated contract function signatures
    const fnCheck: CoverageLedgerFns["is_covered"] = {
      args: { sac: "C...", minBps: 10000, maxAge: 3600, minTier: Tier.IssuerSigned },
      return: true,
    };
    expect(fnCheck.return).toBe(true);
  });
});
