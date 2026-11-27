import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CopyButton,
  copyAnnouncement,
  copyToClipboard,
  fallbackCopyText,
} from "../components/ui";

const FULL_HASH = "d1f4a1c7b3e9a5d2f8c6b0e4a7d9f1c3b5e7a9d2f4c6b8e0a1d3f5c7b9e2d4a6";

function createMockDocument(execResult = true) {
  let lastCreated: {
    value: string;
    style: Record<string, string>;
    setAttribute: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    setSelectionRange: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  } | null = null;
  const appendChild = vi.fn();
  const execCommand = vi.fn().mockReturnValue(execResult);
  const doc = {
    activeElement: null,
    body: {
      appendChild,
      contains: vi.fn().mockReturnValue(false),
    },
    createElement: vi.fn(() => {
      lastCreated = {
        value: "",
        style: {},
        setAttribute: vi.fn(),
        focus: vi.fn(),
        select: vi.fn(),
        setSelectionRange: vi.fn(),
        remove: vi.fn(),
      };
      return lastCreated;
    }),
    execCommand,
  } as unknown as Document;
  return { doc, appendChild, execCommand, getTextarea: () => lastCreated };
}

describe("copyToClipboard", () => {
  it("writes the full value, not a shortened display form", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyToClipboard(FULL_HASH, { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(FULL_HASH);
  });

  it("reports failure when the clipboard rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    await expect(copyToClipboard(FULL_HASH, { writeText })).resolves.toBe(false);
  });

  it("reports failure when there is no clipboard", async () => {
    await expect(copyToClipboard(FULL_HASH, undefined)).resolves.toBe(false);
  });

  it("falls back to textarea copy when the Clipboard API is unavailable", async () => {
    const { doc, appendChild, execCommand, getTextarea } = createMockDocument(true);
    await expect(copyToClipboard(FULL_HASH, undefined, doc)).resolves.toBe(true);
    const textarea = getTextarea();
    expect(textarea?.value).toBe(FULL_HASH);
    expect(textarea?.select).toHaveBeenCalledOnce();
    expect(textarea?.setSelectionRange).toHaveBeenCalledWith(0, FULL_HASH.length);
    expect(appendChild).toHaveBeenCalledOnce();
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(textarea?.remove).toHaveBeenCalledOnce();
  });

  it("falls back to textarea copy when the Clipboard API rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    const { doc, execCommand } = createMockDocument(true);
    await expect(copyToClipboard(FULL_HASH, { writeText }, doc)).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("returns false when the fallback copy command fails", () => {
    const { doc, getTextarea } = createMockDocument(false);
    expect(fallbackCopyText(FULL_HASH, doc)).toBe(false);
    expect(getTextarea()?.remove).toHaveBeenCalledOnce();
  });
});

describe("copyAnnouncement", () => {
  it("announces success and failure plainly", () => {
    expect(copyAnnouncement(true)).toBe("Copied");
    expect(copyAnnouncement(false)).toBe("Could not copy");
  });
});

describe("CopyButton", () => {
  it("is a keyboard-operable button with a live region", () => {
    const html = renderToStaticMarkup(
      createElement(CopyButton, { value: FULL_HASH, label: "document hash" }),
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Copy document hash"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Copy</button>");
  });

  it("renders a keyboard-accessible icon button when variant is icon", () => {
    const html = renderToStaticMarkup(
      createElement(CopyButton, { value: FULL_HASH, label: "document hash", variant: "icon" }),
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Copy document hash"');
    expect(html).toContain('class="secondary copy-trigger copy-trigger-icon"');
    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('role="status"');
  });

  it("can be disabled when there is nothing to copy", () => {
    const html = renderToStaticMarkup(
      createElement(CopyButton, { value: "", label: "document hash", disabled: true }),
    );
    expect(html).toContain('disabled=""');
  });
});
