"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { logger } from "@/lib/logger";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    logger.error("Page render failed", error);
    heading.current?.focus();
  }, [error]);

  return (
    <section className="card mt" aria-labelledby="error-heading">
      <div className="eyebrow">Something went wrong</div>
      <h1 id="error-heading" tabIndex={-1} ref={heading}>
        This page could not be displayed
      </h1>
      <p className="sub">
        The page hit an error while rendering. Try again; if it keeps happening, go back to the
        dashboard.
      </p>
      {error.digest ? <p className="sub">Reference: {error.digest}</p> : null}
      <p className="row mt">
        <button type="button" onClick={reset}>
          Try again
        </button>
        <Link href="/" className="secondary">
          Back to the dashboard
        </Link>
      </p>
    </section>
  );
}
