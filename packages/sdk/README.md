# @plimsoll/sdk

TypeScript client for [Plimsoll](https://github.com/plimsoll-protocol/plimsoll-contracts),
the on-chain record of how much of a Stellar-issued asset is backed. It reads
the coverage ledger and reporter registry through Soroban RPC simulation,
builds prepared (unsigned) transactions for writes, wraps the Plimsoll indexer
API, and verifies documents against the hashes recorded on-chain. It never
holds keys.

**Full documentation:** https://plimsoll-protocol.gitbook.io/plimsoll-protocol-docs/developers/sdk

## Install

```bash
npm install @plimsoll/sdk
```

- Published to the public npm registry as `@plimsoll/sdk`, with
  [npm provenance](https://docs.npmjs.com/generating-provenance-statements)
  attesting the build to the `plimsoll-protocol/plimsoll-app` repository.
  Pin a release with `npm install @plimsoll/sdk@0.1.0`.
- Node 22.12 or later, or any modern browser. Hash checks use Web Crypto
  (`globalThis.crypto.subtle`).
- ESM only: use `import`. There is no CommonJS build, so `require("@plimsoll/sdk")`
  does not work.
- Amounts are `bigint` in smallest units (7 decimals for classic assets).
  Convert to text only for display, with `formatUnits`.

## Read coverage from the contracts

`coverage` returns the ratio the coverage ledger computes; `isCovered` is the
same check another contract makes before accepting an asset.

```ts
import { PlimsollContracts, TESTNET, Tier, bpsToPercent, formatUnits } from "@plimsoll/sdk";

const plimsoll = new PlimsollContracts(TESTNET);
const sac = TESTNET.assets.PUSD!.sac;

// Reserves over supply, from the latest report at or above the tier you ask for.
const cov = await plimsoll.coverage(sac, Tier.Transcribed);
if (cov) {
  console.log(bpsToPercent(cov.bps)); // e.g. "102.00%"; null when nothing is owed
  console.log(formatUnits(cov.reserves)); // e.g. "1,020,000"
}

// The yes/no answer a contract gets from `is_covered`: at least 100% backed,
// readings at most 7 days old, issuer-signed or stronger.
const ok = await plimsoll.isCovered(sac, 10_000, 7 * 86_400, Tier.IssuerSigned);
console.log(ok ? "accept" : "refuse");
```

`TESTNET` is the v0.1 testnet deployment. For another network, pass your own
`NetworkConfig` (`rpcUrl`, `networkPassphrase`, `coverageLedgerId`,
`reporterRegistryId`). A failed simulation throws `ContractCallError`.

## Query the indexer

The indexer serves every listed asset, its reports and its history in one
request, which is cheaper than a contract read per asset.

```ts
import { IndexerClient, Tier, bpsToPercent, formatUnits } from "@plimsoll/sdk";

const indexer = new IndexerClient("https://plimsoll-indexer.onrender.com");

// Every listed asset, with coverage judged against issuer-signed reports or stronger.
for (const asset of await indexer.listAssets(Tier.IssuerSigned)) {
  const cov = asset.coverage;
  if (cov?.bps == null) {
    console.log(asset.code, "no reading");
  } else {
    console.log(asset.code, bpsToPercent(cov.bps), "of", formatUnits(BigInt(cov.supply)));
  }
}
```

`IndexerClient` takes an optional `fetch` implementation as its second
argument. A non-2xx response throws `IndexerError`, which carries the HTTP
`status`.

### Stream new reports

`indexer.streamReports(sac)` returns an async iterable of new reserve reports
for one asset, fed by the indexer's server-sent events, so a `for await` loop
can follow an asset live. Leaving the loop (`break`, `return()`, or an
`AbortSignal` passed as `{ signal }`) closes the underlying `EventSource`. A
dropped connection reconnects on its own with back-off. Reports that arrive
while your loop is busy are kept in order, up to `maxBuffered` (default 1 000);
past that the iterator throws `ReportStreamOverflowError` instead of dropping
reports silently. The stream needs an indexer that serves
`GET /v1/assets/{sac}/events`.

## Verify a figure

Every supply snapshot records a sha256 of the per-bucket breakdown it was
computed from, and every reserve report records a sha256 of its document.
`matchesHash` checks bytes against such a hash; `parseBreakdown` reads the
breakdown once it has been checked.

```ts
import {
  IndexerClient,
  PlimsollContracts,
  TESTNET,
  matchesHash,
  parseBreakdown,
} from "@plimsoll/sdk";

const plimsoll = new PlimsollContracts(TESTNET);
const indexer = new IndexerClient("https://plimsoll-indexer.onrender.com");
const sac = TESTNET.assets.PUSD!.sac;

// The supply poster records the total and a sha256 of its per-bucket breakdown.
const supply = await plimsoll.getSupply(sac);
if (!supply) throw new Error("no supply snapshot yet");

// Check the breakdown bytes against the on-chain hash before trusting them.
const bytes = await indexer.breakdown(supply.breakdownHash);
if (!(await matchesHash(bytes, supply.breakdownHash))) {
  throw new Error("breakdown does not match the hash recorded on-chain");
}

const breakdown = parseBreakdown(bytes);
console.log(breakdown.total === supply.amount.toString()); // true: the total that was posted
console.log(breakdown.liquidity_pools, breakdown.claimable_balances); // smallest units
```

The same check works for a reserve report: download `report.docUri` and
compare it with `matchesHash(bytes, report.docHash)`.

## Examples are compiled

Each code block above is a file in [`examples/`](https://github.com/plimsoll-protocol/plimsoll-app/tree/main/packages/sdk/examples), typechecked against
the SDK source by `npm run typecheck`. A test fails if this README and those
files drift apart.

## License

[Apache-2.0](https://github.com/plimsoll-protocol/plimsoll-app/blob/main/LICENSE)
