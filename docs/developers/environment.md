# Environment variables

## Web app (`apps/web`)

Baked in at build time. All optional.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_STELLAR_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC |
| `NEXT_PUBLIC_HORIZON_URL` | `https://horizon-testnet.stellar.org` | Horizon |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Network |
| `NEXT_PUBLIC_NETWORK_NAME` | `testnet` | Header label and wallet check message |
| `NEXT_PUBLIC_COVERAGE_LEDGER_ID` | `CC2QQ7R4…MN4D` | coverage-ledger |
| `NEXT_PUBLIC_REPORTER_REGISTRY_ID` | `CCZCBR7M…7GOB` | reporter-registry |
| `NEXT_PUBLIC_INDEXER_URL` | `https://plimsoll-indexer.onrender.com` | Indexer base URL; `none` = chain only. Requests time out after 8 s and fall back to the chain. |
| `NEXT_PUBLIC_CHAIN_ASSETS` | PUSD and USDC SACs | Comma-separated SACs shown in chain-only mode |
| `NEXT_PUBLIC_EXPLORER_URL` | Stellar Expert for `NEXT_PUBLIC_NETWORK_PASSPHRASE` (`public`, `testnet` or `futurenet`) | Explorer links |
| `NEXT_PUBLIC_BASE_PATH` | empty | URL prefix, e.g. `/plimsoll-app` on GitHub Pages |

On a hosting platform, set these in its environment settings **before** the
build. Changing them after the build has no effect, because the site is static.

## Indexer

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | Postgres connection string |
| `COVERAGE_LEDGER_ID` | yes | — | Contract to index and post to |
| `REPORTER_REGISTRY_ID` | yes | — | Contract to index |
| `PORT` | no | `8080` | HTTP port |
| `STELLAR_RPC_URL` | no | testnet RPC | Soroban RPC |
| `HORIZON_URL` | no | testnet Horizon | Source of supply data |
| `STELLAR_NETWORK_PASSPHRASE` | no | testnet | Signing network |
| `START_LEDGER` | no | latest | First ledger to ingest on an empty database |
| `SUPPLY_POSTER_SECRET` | no | empty | Secret seed of a registered SupplyPoster; empty = read-only |
| `INGEST_INTERVAL` | no | `10s` | Event polling interval |
| `POST_INTERVAL` | no | `15m` | How often supply is checked |
| `REPOST_AFTER` | no | `6h` | Repost unchanged supply after this long |
| `TOML_INTERVAL` | no | `6h` | Refresh each issuer's stellar.toml after this long |
| `CORS_ORIGINS` | no | `*` | Comma-separated allowed origins |
| `LOG_LEVEL` | no | `info` | `debug`, `info`, `warn`, `error` |
| `KEEP_AWAKE_URL` | no | `$RENDER_EXTERNAL_URL/healthz` on Render, else off | URL requested every interval so the host does not sleep the service; `none` turns it off |
| `KEEP_AWAKE_INTERVAL` | no | `10m` | How often to request it |

## Contracts

`scripts/deploy-testnet.sh` needs no variables. It creates or reuses Stellar
CLI identities named `plimsoll-admin`, `plimsoll-poster`, `plimsoll-auditor`,
`plimsoll-issuer` and `plimsoll-holder`, and writes
`deployments/testnet.json`.
