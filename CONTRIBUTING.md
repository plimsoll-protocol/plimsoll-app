# Contributing to Plimsoll app

## Picking up an issue

1. Find an open issue (`good first issue` for a first pull request).
2. Comment to be assigned. Wait for assignment before starting.
3. Ask in the issue if anything is unclear.

## Local setup

```bash
npm install
npm run dev
```

In development, the browser console exposes `window.__plimsoll__` with the
active SDK clients (`sdk.contracts` and `sdk.indexer`), app `config`, and
`lastResponse`. The latter records the most recently completed SDK call,
including its client, method, arguments, and response or error. This object is
not attached outside development mode.

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
