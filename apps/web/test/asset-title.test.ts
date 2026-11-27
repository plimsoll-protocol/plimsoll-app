import { describe, expect, it } from "vitest";
import { AssetTitleManager, formatAssetTitle } from "../lib/asset-title";

describe("formatAssetTitle", () => {
  it("includes the covered percentage using the coverage UI formatter", () => {
    expect(formatAssetTitle("PUSD", 10_200, "covered")).toBe("PUSD — Covered (102.00%)");
  });

  it("identifies any known non-covered status as uncovered", () => {
    expect(formatAssetTitle("PUSD", 9_900, "under")).toBe("PUSD — Uncovered");
    expect(formatAssetTitle("PUSD", 10_200, "stale")).toBe("PUSD — Uncovered");
  });

  it("does not create titles for missing, unknown, or unformattable coverage", () => {
    expect(formatAssetTitle("PUSD", undefined, "unknown")).toBeNull();
    expect(formatAssetTitle("PUSD", 10_000, "unknown")).toBeNull();
    expect(formatAssetTitle("PUSD", 4_294_967_295, "covered")).toBeNull();
    expect(formatAssetTitle("", 10_000, "covered")).toBeNull();
  });
});

describe("AssetTitleManager", () => {
  it("updates when coverage changes and switches to the selected asset", () => {
    const target = { title: "Plimsoll — is it backed?" };
    const manager = new AssetTitleManager(target);

    manager.update(formatAssetTitle("PUSD", 10_200, "covered"));
    expect(target.title).toBe("PUSD — Covered (102.00%)");

    manager.update(formatAssetTitle("PUSD", 9_900, "under"));
    expect(target.title).toBe("PUSD — Uncovered");

    manager.update(formatAssetTitle("USDC", 10_000, "covered"));
    expect(target.title).toBe("USDC — Covered (100.00%)");
  });

  it("restores the original title when coverage is unavailable or the page unmounts", () => {
    const target = { title: "Plimsoll — is it backed?" };
    const manager = new AssetTitleManager(target);

    manager.update(formatAssetTitle("PUSD", 10_200, "covered"));
    manager.update(null);
    expect(target.title).toBe("Plimsoll — is it backed?");

    manager.update(formatAssetTitle("PUSD", 10_200, "covered"));
    manager.restore();
    expect(target.title).toBe("Plimsoll — is it backed?");
  });

  it("does not overwrite a title subsequently managed by another page", () => {
    const target = { title: "Plimsoll — is it backed?" };
    const manager = new AssetTitleManager(target);
    manager.update(formatAssetTitle("PUSD", 10_200, "covered"));
    target.title = "How it works · Plimsoll";

    manager.restore();
    expect(target.title).toBe("How it works · Plimsoll");
  });
});
