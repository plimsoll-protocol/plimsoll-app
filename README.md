<p align="center">
  <img src="https://raw.githubusercontent.com/plimsoll-protocol/plimsoll-contracts/main/docs/banner.svg" alt="Plimsoll" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/plimsoll-protocol/plimsoll-app/actions/workflows/ci.yml"><img src="https://github.com/plimsoll-protocol/plimsoll-app/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://plimsoll-app-gths-amber.vercel.app/"><img src="https://img.shields.io/badge/live-testnet-c8341f" alt="Live on testnet" /></a>
  <img src="https://img.shields.io/badge/next.js-16-0f1d2b" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/stellar--sdk-17.2.1-0f1d2b" alt="stellar-sdk 17" />
  <a href="https://plimsoll-protocol.gitbook.io/plimsoll-protocol-docs/"><img src="https://img.shields.io/badge/docs-gitbook-0f1d2b" alt="Docs" /></a>
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0" />
</p>

# Plimsoll app

The web app and TypeScript SDK for [Plimsoll](https://github.com/plimsoll-protocol/plimsoll-contracts):
see how much of every Stellar-issued asset is backed, who signed the reserve
figure, and how old it is. Issuers and auditors post reports from here;
anyone can list an asset.

**Live:** https://plimsoll-app-gths-amber.vercel.app/  
**Mirror:** https://plimsoll-protocol.github.io/plimsoll-app/  
**Docs:** https://plimsoll-protocol.gitbook.io/plimsoll-protocol-docs/

| Repo | What it is |
| --- | --- |
| [plimsoll-contracts](https://github.com/plimsoll-protocol/plimsoll-contracts) | Rust/Soroban contracts |
| **plimsoll-app** (this repo) | Web app and TypeScript SDK |
| [plimsoll-indexer](https://github.com/plimsoll-protocol/plimsoll-indexer) | Go service: supply poster, event indexer, read API |

## Maintainers

| Maintainer | GitHub | Contact |
| --- | --- | --- |
| dunnidev | [@dunnidev](https://github.com/dunnidev) | [GitHub Discussions](https://github.com/plimsoll-protocol/plimsoll-app/discussions) |

## Layout

| Path | Purpose |
| --- | --- |
| [`packages/sdk`](packages/sdk) | `@plimsoll/sdk`: contract reads via RPC simulation, prepared write transactions, indexer client, formatting and hash verification. |
| [`apps/web`](apps/web) | Next.js 16 static export. Dashboard, asset detail, report submission, asset listing, integration guide. |

The web app reads from the Plimsoll indexer when `NEXT_PUBLIC_INDEXER_URL` is
set, and falls back to reading the coverage ledger directly over Soroban RPC.
Because it is a static export, it runs on any static host.

## Pages

| Route | What it does |
| --- | --- |
| `/` | Every listed asset with its coverage ratio, signer tier and report age |
| `/asset/?sac=…` | Reports per tier, supply breakdown, stellar.toml data, and three in-browser checks: live `coverage` call, document hash, breakdown hash |
| `/badge/?sac=…` | Compact reserve-coverage badge for embedding in an iframe |
| `/report/` | Connect a Stellar wallet (Freighter, xBull, Albedo, Lobstr or Hana), hash a document locally, sign and post a reserve report. Shows the tier you will get before you sign. |
| `/list/` | List any classic asset; deploys its Stellar Asset Contract first if it has none |
| `/integrate/` | How to call `is_covered` from Rust, TypeScript and the CLI |

## Quick start

Node 22.12 or later.

```bash
git clone https://github.com/plimsoll-protocol/plimsoll-app
cd plimsoll-app
npm install
npm run dev        # builds the SDK, then serves http://localhost:3000
```

No `.env` is needed: everything defaults to the testnet deployment. To use an
indexer, copy `apps/web/.env.example` to `apps/web/.env.local` and set
`NEXT_PUBLIC_INDEXER_URL`.

```bash
npm test                         # SDK unit tests
PLIMSOLL_LIVE=1 npm test         # plus reads against the live testnet contracts
npm run build                    # static site in apps/web/out
```

### Offline and live tests

The SDK tests run in two modes:

| Mode | Command | In CI |
| --- | --- | --- |
| Offline | `npm test` | The `test` job, on every pull request and push to `main`. It is the required check and never touches the network: RPC and the indexer are stubbed. |
| Live | `PLIMSOLL_LIVE=1 npm test` | The `live testnet` job, on every push to `main`, nightly, and on demand from the Actions tab. It never runs on pull requests, so a testnet reset or an RPC outage cannot block one. |

A live test whose network cannot be reached is skipped rather than failed. When
the live job fails on `main` or on the nightly run, it opens an issue titled
"Live testnet tests are failing" (or comments on the open one) with a link to
the run.

## SDK in 6 lines

```ts
import { PlimsollContracts, TESTNET, Tier, bpsToPercent } from "@plimsoll/sdk";

const plimsoll = new PlimsollContracts(TESTNET);
const cov = await plimsoll.coverage(TESTNET.assets.PUSD.sac, Tier.Transcribed);
console.log(bpsToPercent(cov!.bps)); // "102.00%"
const ok = await plimsoll.isCovered(TESTNET.assets.PUSD.sac, 10_000, 7 * 86_400, Tier.IssuerSigned);
```

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_STELLAR_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | testnet | Network passphrase |
| `NEXT_PUBLIC_NETWORK_NAME` | `testnet` | Label shown in the header and wallet checks |
| `NEXT_PUBLIC_COVERAGE_LEDGER_ID` | testnet id | coverage-ledger contract |
| `NEXT_PUBLIC_REPORTER_REGISTRY_ID` | testnet id | reporter-registry contract |
| `NEXT_PUBLIC_INDEXER_URL` | hosted testnet indexer | Indexer base URL; `none` reads from chain only |
| `NEXT_PUBLIC_CHAIN_ASSETS` | PUSD,USDC SACs | Assets shown when reading from chain |
| `NEXT_PUBLIC_EXPLORER_URL` | Stellar Expert for the network passphrase | Explorer links |
| `NEXT_PUBLIC_BASE_PATH` | empty | Set to `/plimsoll-app` for GitHub Pages |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Pick an issue, comment to be assigned,
open one pull request per change. Security: [SECURITY.md](SECURITY.md).

## Contributors

<a href="https://github.com/plimsoll-protocol/plimsoll-app/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=plimsoll-protocol/plimsoll-app" alt="Contributors" />
</a>

## License

[Apache-2.0](LICENSE)
