"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Footer, Header } from "./SiteChrome";

export function SiteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const embedded = pathname === "/widget" || pathname === "/widget/";

  return (
    <>
      {!embedded ? (
        <>
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <Header />
        </>
      ) : null}
      <main id="main-content" className={embedded ? "widget-main" : undefined} tabIndex={-1}>
        <div className={embedded ? "widget-wrap" : "wrap"}>{children}</div>
      </main>
      {!embedded ? <Footer /> : null}
    </>
  );
}
