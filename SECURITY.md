# Security policy

The app and SDK are unaudited and target Stellar testnet.

## Reporting

Report privately via
[Security → Report a vulnerability](https://github.com/plimsoll-protocol/plimsoll-app/security/advisories/new).
Include the affected page or SDK function, the impact, and steps to reproduce.
Do not open public issues for vulnerabilities. We aim to respond within 72 hours.

## Scope

In scope: transaction construction in `@plimsoll/sdk` (wrong arguments, wrong
network, wrong source), anything that could make a user sign something other
than what the page shows, XSS through asset codes, stellar.toml data or
document URLs, and hash-verification logic that can report a false match.

Out of scope: Freighter itself, RPC availability, and the accuracy of reserve
figures posted by reporters.

## Design notes

- The app never handles secret keys. All signing happens in the wallet.
- Document and breakdown hashes are computed in the browser with Web Crypto.
- Data from stellar.toml files is rendered as text, never as HTML.
- A Content-Security-Policy is set in a meta tag on every page, built from
  `lib/config.ts` (RPC, Horizon and indexer origins) and finished after the
  build by `apps/web/scripts/apply-csp.mjs`, which adds the sha256 of each
  inline script. Scripts allow only `self` and those hashes, never
  `unsafe-inline`.

### Limits of a meta-delivered CSP

GitHub Pages cannot send headers, so the policy is a meta tag. It applies only
once the browser has parsed the tag, so nothing before it in the document is
covered. `frame-ancestors`, `report-uri`/`report-to` and `sandbox` are
ignored in a meta tag, so clickjacking protection and violation reports need a
host that sets real headers. `connect-src` also allows `https:`, because the
app fetches issuer stellar.toml files and reserve documents from arbitrary
hosts; the listed origins document intent but do not stop an injected script
from sending data to another https host. Style attributes (`style-src-attr`)
allow inline styles from React style props. If you change the indexer URL, the
RPC or Horizon, rebuild: the policy follows `lib/config.ts`.
