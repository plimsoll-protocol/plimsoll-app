"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { config, explorer } from "@/lib/config";
import { PlimsollMark } from "./ui";

const NAV = [
  { href: "/", label: "Assets" },
  { href: "/mainnet/", label: "Mainnet watch" },
  { href: "/report/", label: "Post a report" },
  { href: "/list/", label: "List an asset" },
  { href: "/integrate/", label: "Integrate" },
  { href: "/about/", label: "How it works" },
];

const DOCS_URL = "https://plimsoll-protocol.gitbook.io/plimsoll-protocol-docs/";

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);

  // Navigating closes the menu.
  useEffect(() => {
    setOpen(false);
  }, [path]);

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
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <span>
          Plimsoll — reserve coverage for Stellar-issued assets. Unaudited software on{" "}
          {config.networkName}.
        </span>
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
