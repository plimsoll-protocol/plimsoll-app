"use client";

import type { RefObject } from "react";

export function ShortcutDialog({
  dialogRef,
  onRequestClose,
  onClosed,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onRequestClose: () => void;
  onClosed: () => void;
}) {
  return (
    <dialog
      ref={dialogRef}
      className="shortcut-dialog"
      aria-modal="true"
      aria-labelledby="shortcut-dialog-title"
      aria-describedby="shortcut-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        onRequestClose();
      }}
      onClose={onClosed}
    >
      <div className="spread shortcut-dialog-heading">
        <div>
          <h2 id="shortcut-dialog-title">Keyboard shortcuts</h2>
          <p id="shortcut-dialog-description" className="sub">
            Use these shortcuts anywhere on the page, outside text-entry fields.
          </p>
        </div>
        <button type="button" className="secondary" autoFocus onClick={onRequestClose}>
          Close
        </button>
      </div>
      <dl className="shortcut-list">
        <div>
          <dt>
            <kbd>/</kbd>
          </dt>
          <dd>Focus asset search</dd>
        </div>
        <div>
          <dt>
            <kbd>d</kbd>
          </dt>
          <dd>Toggle dark mode</dd>
        </div>
        <div>
          <dt>
            <kbd>r</kbd>
          </dt>
          <dd>Refresh data</dd>
        </div>
        <div>
          <dt>
            <kbd>?</kbd>
          </dt>
          <dd>Show this cheatsheet</dd>
        </div>
        <div>
          <dt>
            <kbd>Esc</kbd>
          </dt>
          <dd>Close the cheatsheet</dd>
        </div>
      </dl>
    </dialog>
  );
}
