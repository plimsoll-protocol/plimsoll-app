# ADR 001 — Indexer vs. pure RPC for the web app

## Context

The web app displays reserve coverage data: circulating supply, reserve reports per tier,
coverage ratios, and supply history. Two architectures were evaluated:

1. **Pure RPC** — every page fetches directly from an RPC node.
2. **Indexer-first with RPC fallback** — the web app fetches from the Plimsoll indexer
   when configured; falls back to RPC reads otherwise.

| Concern | Pure RPC | Indexer-first |
|---|---|---|
| Operational simplicity | High — no extra service | Lower — indexer must be deployed |
| Supply history | Not possible (ledger state is current-only) | Available via event log |
| Read latency | 1–3 s per simulation | < 100 ms |
| Offline / testnet deployments | Works with any node | Requires indexer |
| Data trust model | Cryptographically verified | Trusted service |

## Decision

**Use indexer-first with RPC fallback.**

`loadAsset()` in `apps/web/lib/data.ts` tries the indexer when `NEXT_PUBLIC_INDEXER_URL`
is set and falls back to direct RPC otherwise. Both paths normalise to the same `AssetView`
type. Supply history is omitted when no indexer is configured.

## Consequences

- Developers running `npm run dev` with no `.env` get a fully functional app via RPC alone.
- Production deployments gain supply history and faster page loads via the indexer.
- On-chain verification calls (`is_covered`) always go to RPC regardless of indexer use.
- An indexer outage degrades gracefully — the app falls back to RPC rather than erroring.
