"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { loadSearchData, type SearchData } from "@/lib/search-data";
import {
  DOC_ENTRIES,
  KIND_LABELS,
  PAGE_ENTRIES,
  SEARCH_DEBOUNCE_MS,
  createDebouncer,
  isSearchShortcut,
  nextActiveIndex,
  searchEntries,
  type SearchEntry,
} from "@/lib/search";
import styles from "./SearchPalette.module.css";

const STATIC_ENTRIES: readonly SearchEntry[] = [...PAGE_ENTRIES, ...DOC_ENTRIES];

// The shortcut label depends on the platform, which the static export cannot know, so it is
// read on the client only; the server and the first client render both say "Ctrl K".
const noSubscribe = () => () => undefined;
const isApplePlatform = () => /mac|iphone|ipad/i.test(navigator.userAgent);

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * The CMD+K / CTRL+K search overlay, with the header button that also opens it.
 * Matching, ranking and key rules live in lib/search.ts; this wires them to the
 * page. Assets and reporters are read the first time it opens.
 */
export function SearchPalette() {
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const mac = useSyncExternalStore(noSubscribe, isApplePlatform, () => false);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  // The highlighted row belongs to one result list; a new list starts again at its first row.
  const [cursor, setCursor] = useState<{ list: readonly SearchEntry[]; index: number }>({
    list: [],
    index: 0,
  });
  const [data, setData] = useState<SearchData | null>(null);

  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const debouncer = useMemo(() => createDebouncer(setQuery, SEARCH_DEBOUNCE_MS), []);
  useEffect(() => () => debouncer.cancel(), [debouncer]);

  const show = useCallback(() => {
    // Remember where focus was so closing puts it back, not on the page top.
    const current = document.activeElement;
    if (current instanceof HTMLElement && current !== document.body) {
      returnFocus.current = current;
    }
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    debouncer.cancel();
    setOpen(false);
    setInput("");
    setQuery("");
    (returnFocus.current ?? trigger.current)?.focus();
    returnFocus.current = null;
  }, [debouncer]);

  // The shortcut works from anywhere on the page, including inside a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isSearchShortcut(e)) return;
      e.preventDefault();
      if (open) field.current?.focus();
      else show();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, show]);

  // Escape closes even when focus has strayed off the field; the page behind
  // does not scroll while the overlay is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    field.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  // Assets and reporters are read on first open, and again on a later open if a source failed.
  useEffect(() => {
    if (!open || (data && data.failed.length === 0)) return;
    let cancelled = false;
    loadSearchData().then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
    // `data` is deliberately not a dependency: setting it must not start another read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const entries = useMemo(() => [...(data?.entries ?? []), ...STATIC_ENTRIES], [data]);
  const results = useMemo(() => searchEntries(entries, query), [entries, query]);

  const active = cursor.list === results ? cursor.index : 0;
  const setActive = useCallback((index: number) => setCursor({ list: results, index }), [results]);
  const loading = open && data === null;

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [active, results]);

  const choose = useCallback(
    (entry: SearchEntry) => {
      close();
      if (entry.external) window.open(entry.href, "_blank", "noopener,noreferrer");
      else router.push(entry.href);
    },
    [close, router],
  );

  const onFieldKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    const next = nextActiveIndex(active, results.length, e.key);
    if (next !== null) {
      e.preventDefault();
      setActive(next);
      return;
    }
    if (e.key === "Enter") {
      const entry = results[active];
      if (entry) {
        e.preventDefault();
        choose(entry);
      }
    }
  };

  // Tab stays inside the overlay: the field and the close button are all it holds.
  const onPanelKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const items = panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!items || items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const onChange = (value: string) => {
    setInput(value);
    debouncer.call(value);
  };

  const activeId = results[active] ? `${listId}-${active}` : undefined;
  const searching = input.trim() !== query.trim();
  const shortcut = mac ? "⌘K" : "Ctrl K";

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`secondary ${styles.trigger}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts="Control+K Meta+K"
        onClick={show}
      >
        Search
        <kbd className={styles.kbd} aria-hidden="true">
          {shortcut}
        </kbd>
      </button>

      {open ? (
        <div
          className={styles.backdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            ref={panel}
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            onKeyDown={onPanelKey}
          >
            <div className={styles.bar}>
              <input
                ref={field}
                type="text"
                role="combobox"
                className={styles.field}
                placeholder="Search assets, reporters and docs"
                aria-label="Search assets, reporters and docs"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={activeId}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={input}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onFieldKey}
              />
              <button
                type="button"
                className={`secondary ${styles.close}`}
                aria-label="Close search"
                onClick={close}
              >
                Esc
              </button>
            </div>

            <ul ref={list} id={listId} role="listbox" aria-label="Results" className={styles.list}>
              {results.map((entry, index) => (
                <li
                  key={entry.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={styles.option}
                  onMouseMove={() => {
                    if (index !== active) setActive(index);
                  }}
                  onClick={() => choose(entry)}
                >
                  <span className={styles.kind}>{KIND_LABELS[entry.kind]}</span>
                  <span className={styles.text}>
                    <span className={styles.title}>{entry.title}</span>
                    <span className={styles.detail}>{entry.detail}</span>
                  </span>
                  {entry.external ? (
                    <span className={styles.out} aria-hidden="true">
                      ↗
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>

            {results.length === 0 && !searching ? (
              <p className={styles.note}>
                {loading
                  ? "Loading assets and reporters…"
                  : `Nothing matches “${query.trim()}”. Try an asset code, a reporter name or a page.`}
              </p>
            ) : null}
            {loading && results.length > 0 ? (
              <p className={styles.note}>Loading assets and reporters…</p>
            ) : null}
            {!loading && data && data.failed.length > 0 ? (
              <p className={styles.note} role="status">
                Could not load {data.failed.join(" and ")}, so those results may be missing. Pages
                and docs are still searchable.
              </p>
            ) : null}

            <p className="sr-only" role="status" aria-live="polite">
              {searching ? "" : `${results.length} result${results.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
