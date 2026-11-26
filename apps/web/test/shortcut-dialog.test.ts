import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ShortcutDialog } from "../components/ShortcutDialog";

describe("ShortcutDialog", () => {
  it("renders a labelled modal with all shortcuts and a keyboard-operable close button", () => {
    const html = renderToStaticMarkup(
      createElement(ShortcutDialog, {
        dialogRef: createRef<HTMLDialogElement>(),
        onRequestClose: vi.fn(),
        onClosed: vi.fn(),
      }),
    );
    expect(html).toContain("<dialog");
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="shortcut-dialog-title"');
    expect(html).toContain('aria-describedby="shortcut-dialog-description"');
    expect(html).toContain('type="button"');
    expect(html).toContain("Keyboard shortcuts");
    expect(html).toContain("Focus asset search");
    expect(html).toContain("Toggle dark mode");
    expect(html).toContain("Refresh data");
    expect(html).toContain("Close the cheatsheet");
  });
});
