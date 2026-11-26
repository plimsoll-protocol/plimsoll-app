"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { assetFromSearch } from "@/lib/asset-query";
import { config, explorer } from "@/lib/config";
import { handleGlobalShortcut } from "@/lib/keyboard-shortcuts";
import { toggleTheme } from "@/lib/theme";
import { ShortcutDialog } from "./ShortcutDialog";
import { ThemeToggle } from "./ThemeToggle";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ago } from "@plimsoll/sdk";
import { config, explorer } from "@/lib/config";
import { loadIndexerStatus, type IndexerStatus } from "@/lib/data";
import { SearchPalette } from "./SearchPalette";
import { PlimsollMark } from "./ui";

const NAV = [
  { href: "/", label: "Assets" },
  { href: "/reporters/", label: "Reporters" },
  { href: "/mainnet/", label: "Mainnet watch" },
  { href: "/report/", label: "Post a report" },
  { href: "/list/", label: "List an asset" },
  { href: "/integrate/", label: "Integrate" },
  { href: "/about/", label: "How it works" },
  { href: "/settings/", label: "Alert settings" },
];

const DOCS_URL = "https://plimsoll-protocol.gitbook.io/plimsoll-protocol-docs/";

export function Header() {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchError, setSearchError] = useState("");
  const [prevPath, setPrevPath] = useState(path);
  const button = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const shortcutsDialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const openShortcuts = () => {
    const active = document.activeElement;
    returnFocus.current = active instanceof HTMLElement ? active : null;
    setShortcutsOpen(true);
  };

  const closeShortcuts = () => {
    if (shortcutsDialog.current?.open) shortcutsDialog.current.close();
    setShortcutsOpen(false);
    if (returnFocus.current?.isConnected) returnFocus.current.focus();
  };

  const searchAsset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = searchValue.trim();
    const params = new URLSearchParams();
    params.set(value.includes(":") ? "asset" : "sac", value);
    const result = assetFromSearch(`?${params}`, config.network.networkPassphrase);
    if (!result.ok) {
      setSearchError(result.error);
      return;
    }
    setSearchError("");
    router.push(`/asset/?sac=${encodeURIComponent(result.sac)}`);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleGlobalShortcut(event, {
        focusSearch: () => search.current?.focus(),
        toggleTheme: () =>
          toggleTheme(
            document.documentElement,
            window.matchMedia("(prefers-color-scheme: dark)").matches,
          ),
        refresh: () => window.location.reload(),
        openCheatsheet: openShortcuts,
        closeCheatsheet: closeShortcuts,
        isCheatsheetOpen: () => shortcutsDialog.current?.open ?? false,
      });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const dialog = shortcutsDialog.current;
    if (shortcutsOpen && dialog && !dialog.open) dialog.showModal();
  }, [shortcutsOpen]);

  // Navigating closes the menu.
  if (prevPath !== path) {
    setPrevPath(path);
    setOpen(false);
  }

  // Escape closes the menu and returns focus to its button; opening moves focus to the first link.
  useEffect(() => {
    if (!open) return;
    nav.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="brand">
          <PlimsollMark />
          Plimsoll
        </Link>
        <span className="net-pill">{config.networkName}</span>
        <form
          className="site-search"
          role="search"
          aria-label="Search for an asset"
          onSubmit={searchAsset}
        >
          <label className="sr-only" htmlFor="site-asset-search">
            Asset code and issuer, or contract address
          </label>
          <input
            id="site-asset-search"
            ref={search}
            type="search"
            value={searchValue}
            onChange={(event) => {
              setSearchValue(event.target.value);
              setSearchError("");
            }}
            placeholder="CODE:ISSUER or C…"
            aria-invalid={Boolean(searchError)}
            aria-describedby={searchError ? "site-search-error" : undefined}
          />
          <button type="submit" className="secondary">
            Go
          </button>
          {searchError ? (
            <span id="site-search-error" className="sr-only" role="alert">
              {searchError}
            </span>
          ) : null}
        </form>
        <SearchPalette />
        <button
          ref={button}
          type="button"
          className="nav-toggle secondary"
          aria-expanded={open}
          aria-controls="site-nav"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Close" : "Menu"}
          <span className="sr-only"> navigation</span>
        </button>
        <div className="header-actions">
          <ThemeToggle />
          <button
            ref={button}
            type="button"
            className="nav-toggle secondary"
            aria-expanded={open}
            aria-controls="site-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Close" : "Menu"}
            <span className="sr-only"> navigation</span>
          </button>
        </div>
        <nav
          id="site-nav"
          ref={nav}
          className="nav"
          data-open={open ? "true" : "false"}
          aria-label="Main"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={
                path === item.href || (item.href !== "/" && path?.startsWith(item.href))
                  ? "page"
                  : undefined
              }
            >
              {item.label}
            </Link>
          ))}
          <a href={DOCS_URL} target="_blank" rel="noreferrer">
            Docs
          </a>
        </nav>
      </div>
      {shortcutsOpen ? (
        <ShortcutDialog
          dialogRef={shortcutsDialog}
          onRequestClose={closeShortcuts}
          onClosed={() => setShortcutsOpen(false)}
        />
      ) : null}
    </header>
  );
}

export function IndexerStatusIndicator({
  status: initialStatus,
}: {
  status?: IndexerStatus | null;
}) {
  const [status, setStatus] = useState<IndexerStatus | null | undefined>(initialStatus);
  const [prevInitial, setPrevInitial] = useState(initialStatus);

  if (prevInitial !== initialStatus) {
    setPrevInitial(initialStatus);
    setStatus(initialStatus);
  }

  useEffect(() => {
    if (initialStatus !== undefined) return;
    if (!config.indexerUrl) {
      return;
    }
    let cancelled = false;
    loadIndexerStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus({ state: "unreachable" });
      });
    return () => {
      cancelled = true;
    };
  }, [initialStatus]);

  if (!status) return null;

  const label =
    status.state === "ok"
      ? "Indexer: healthy"
      : status.state === "lagging"
        ? `Indexer: lagging${
            status.lastEventAgeSeconds !== undefined
              ? ` (last event ${ago(status.lastEventAgeSeconds)})`
              : ""
          }`
        : "Indexer: unreachable";

  return (
    <span
      className={`indexer-status ${status.state}`}
      data-testid="indexer-status"
      data-status={status.state}
      role="status"
    >
      <span className={`status-dot status-dot-${status.state}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function Footer({ status }: { status?: IndexerStatus | null }) {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <span>
          Plimsoll — reserve coverage for Stellar-issued assets. Unaudited software on{" "}
          {config.networkName}.
        </span>
        <IndexerStatusIndicator status={status} />
        <span className="row">
          <a href={DOCS_URL} target="_blank" rel="noreferrer">
            Docs
          </a>
          <a
            href={explorer.contract(config.network.coverageLedgerId)}
            target="_blank"
            rel="noreferrer"
          >
            Coverage ledger
          </a>
          <a
            href="https://github.com/plimsoll-protocol/plimsoll-contracts"
            target="_blank"
            rel="noreferrer"
          >
            Contracts
          </a>
          <a
            href="https://github.com/plimsoll-protocol/plimsoll-app"
            target="_blank"
            rel="noreferrer"
          >
            App
          </a>
          <a
            href="https://github.com/plimsoll-protocol/plimsoll-indexer"
            target="_blank"
            rel="noreferrer"
          >
            Indexer
          </a>
        </span>
      </div>
    </footer>
  );
}
