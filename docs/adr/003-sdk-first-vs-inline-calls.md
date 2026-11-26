# ADR 003 — SDK-first vs. inline contract calls in the web app

## Context

The web app reads coverage data from Stellar contracts and the Plimsoll indexer. The
workspace already contains `packages/sdk` — a TypeScript package wrapping the contract
ABI and indexer API.

Two patterns were considered:

1. **SDK-first** — the web app imports `@plimsoll/sdk` only.
2. **Inline calls** — the web app builds Stellar transactions and parses `ScVal` responses
   directly, with the SDK used as an optional convenience.

| Concern | SDK-first | Inline calls |
|---|---|---|
| Type safety | Full — SDK types propagate | Partial — ScVal parsing is untyped at edges |
| Duplication | None | Contract ABI and indexer paths duplicated |
| Testing | SDK has its own unit tests | Each page would need its own |
| Breaking-change surface | One place (SDK) | Scattered across page files |

## Decision

**SDK-first.** The web app imports exclusively from `@plimsoll/sdk`.

All contract reads go through `PlimsollContracts`. All indexer reads go through
`IndexerClient`. Inline `stellar-sdk` calls are allowed only in wallet integration
(`lib/wallet.ts`) where the app handles unsigned XDR returned by the SDK.

## Consequences

- Adding a contract function means adding it to the SDK first.
- The SDK's test suite covers the contract interface; the web app's tests cover UI only.
- Changes land atomically — no publish/install cycle between a contract change and the
  web app adopting it.
- Downstream projects get the same typed API the web app uses, keeping the SDK general.
