# ADR 002 — Next.js App Router vs. Vite + React for the web app

## Context

The web app is a data-display frontend that must deploy as plain static files. Main constraints:

- Static hosting (GitHub Pages, Netlify, Vercel)
- Meaningful `<title>` and Open Graph tags per route
- TypeScript + React, integrates with the `@plimsoll/sdk` workspace package
- Large dependency (`@stellar/stellar-sdk`) — tree-shaking matters

Options evaluated:

1. **Next.js App Router with `output: "export"`**
2. **Vite + React (SPA)** with manual routing via React Router

| Concern | Next.js (export) | Vite + React |
|---|---|---|
| Static output | Yes (`output: "export"`) | Yes |
| File-based routing | Built-in | Manual |
| Per-route `<head>` / OG tags | `generateMetadata` | Manual (`react-helmet` or similar) |
| Initial setup complexity | Higher | Lower |

## Decision

**Use Next.js App Router with `output: "export"`.**

The file-based routing and `generateMetadata` API let each asset page declare its own
`<title>` and OG tags without additional libraries.

## Consequences

- The app is a fully static site — no server components that fetch at runtime, no API routes.
- Dynamic routes (e.g. `/assets/[code]/certificate`) use client-side `useParams()` for
  runtime resolution.
- `transpilePackages: ["@plimsoll/sdk"]` ensures the SDK's TypeScript source is compiled
  by Next.js rather than pre-bundled separately.
