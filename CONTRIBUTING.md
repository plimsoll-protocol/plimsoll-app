# Contributing to Plimsoll app

## Picking up an issue

1. Find an open issue (`good first issue` for a first pull request).
2. Comment to be assigned. Wait for assignment before starting.
3. Ask in the issue if anything is unclear.

## Local setup

See [docs/dev-setup.md](docs/dev-setup.md) for the end-to-end guide covering cloning,
installing dependencies, setting up `.env.local`, and starting both the indexer (Docker) and the Next.js app.

```bash
npm install
npm run dev
```

In development, the browser console exposes `window.__plimsoll__` with the
active SDK clients (`sdk.contracts` and `sdk.indexer`), app `config`, and
`lastResponse`. The latter records the most recently completed SDK call,
including its client, method, arguments, and response or error. This object is
not attached outside development mode.
No `.env` is needed: everything defaults to the testnet deployment. To use the
indexer, copy `apps/web/.env.example` to `apps/web/.env.local` and set
`NEXT_PUBLIC_INDEXER_URL`.

## File naming conventions

| Location | Convention | Example |
| --- | --- | --- |
| App routes | `apps/web/app/<route>/page.tsx`, lower kebab-case directory names | `apps/web/app/report/page.tsx` |
| Components | `apps/web/components/<Component>.tsx`, PascalCase | `AssetCard.tsx` |
| Lib modules | `apps/web/lib/<module>.ts`, lower kebab-case | `data.ts`, `config.ts` |
| Tests | `apps/web/test/<name>.test.ts`, describes what it covers | `data.test.ts` |
| SDK source | `packages/sdk/src/<module>.ts`, lower kebab-case | `format.ts` |
| SDK tests | `packages/sdk/test/<name>.test.ts` | `sdk.test.ts` |

Files are lowercase kebab-case except React components, which are PascalCase.
Default exports are used for Next.js pages and layout; named exports for
everything else.

## Adding a new Next.js route

The app is a static export (`next.config.mjs` sets `output: "export"`), so every
route is a page under `apps/web/app/`. To add one:

1. Create `apps/web/app/<route>/page.tsx`.
2. Make it a client component (`"use client"`) when it fetches data, with loading,
   empty and error states. Data pages must work at 360px wide and be keyboard
   accessible (visible focus rings, reachable by Tab).
3. Reuse `components/SiteChrome.tsx` for the header/footer by keeping the page
   inside the root layout, and reuse `components/ui.tsx` primitives
   (`Card`, `Skeleton`, `Notice`, `StatusPill`...) where sensible.
4. Add the route to `apps/web/app/sitemap.ts` (and `PUBLIC_ROUTES` in
   `lib/site.ts` if it should be public) so it appears in sitemap.xml and robots.
5. Document the route in the "Pages" table of `README.md`.
6. Add a test under `apps/web/test/` if the route has logic worth covering.

## Pull request checklist

- [ ] One change per pull request, linked to its issue (`Closes #7`).
- [ ] `npm run typecheck`, `npm test` and `npm run build` pass.
- [ ] SDK changes have tests in `packages/sdk/test`.
- [ ] UI changes include a screenshot in the pull request description, at desktop and phone width.
- [ ] Conventional Commits: `feat(web): …`, `fix(sdk): …`.

## Standards

**TypeScript**
- `strict` and `noUncheckedIndexedAccess` stay on. No `any`; use `unknown` and narrow.
- Amounts are `bigint` in smallest units end to end. Convert to text only at display time with `formatUnits`.
- No floats for money. Basis points are integers.

**React / Next.js**
- The app is a static export. No server components that fetch at request time, no API routes.
- Pages that read data are client components with loading, empty and error states.
- Every interactive element is reachable by keyboard and has a visible focus ring.
- Layouts must work at 360px wide with no horizontal scroll.

**SDK**
- Reads go through RPC simulation; writes return prepared XDR and never hold keys.
- Keep the public API small. New exports need a test and a README line.

## AI-assisted contributions

Allowed if you understand and have tested every line. Untested generated code is closed.
