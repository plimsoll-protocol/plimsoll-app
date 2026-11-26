# TypeScript SDK

`@plimsoll/sdk` lives in `packages/sdk` of the app repo. It reads the
contracts through RPC simulation, builds prepared transactions for writes, and
wraps the indexer API. It never holds keys.

## Read coverage

```ts
import { PlimsollContracts, TESTNET, Tier, bpsToPercent, formatUnits } from "@plimsoll/sdk";

const plimsoll = new PlimsollContracts(TESTNET);
const sac = TESTNET.assets.PUSD.sac;

const cov = await plimsoll.coverage(sac, Tier.Transcribed);
// { bps: 10200, supply: 10000000000000n, reserves: 10200000000000n,
//   tier: 2, supplyLedger: 5034657, supplyTimestamp: 1791196882, reportAsOf: 1791158400 }

bpsToPercent(cov!.bps);        // "102.00%"
formatUnits(cov!.reserves);    // "1,020,000"
```

## Reference

### `PlimsollContracts`

| Method | Returns |
| --- | --- |
| `getAsset(sac)` | `AssetRecord \| null` |
| `getSupply(sac)` | `SupplySnapshot \| null` |
| `getAssetMetadata(sac)` | `AssetMeta` (`code`, `issuer`, `displayName`); reads `asset_metadata` and falls back to the SAC's own `name()` on a ledger without it |
| `getReport(sac, tier)` | `ReserveReport \| null` |
| `getReports(sac)` | `ReserveReport[]`, every tier's latest report in one call |
| `coverage(sac, minTier)` | `Coverage \| null` |
| `isCovered(sac, minBps, maxAgeSeconds, minTier)` | `boolean` |
| `getReporter(address)` | `ReporterInfo \| null` |
| `registryAdmin()` | the registry's admin address |
| `ledgerAdmin()` | the coverage ledger's admin address |
| `prepareListAsset(source, sac)` | unsigned XDR |
| `prepareDeploySac(source, code, issuer)` | unsigned XDR |
| `preparePostReserve({ reporter, sac, amount, asOf, docHash, docUri })` | unsigned XDR |
| `prepareSetReporter(admin, reporter, role, name)` | unsigned XDR; `name` must be 1–64 UTF-8 bytes |
| `prepareRevoke(admin, reporter)` | unsigned XDR |
| `estimateFee(operation)` | resource fee in stroops via simulation, or `0` on error |
| `submit(signedXdr)` | transaction hash, after it succeeds |

A failed simulation throws `ContractCallError`. For contract errors its `code`
is the error number (undefined otherwise); compare it with the `LedgerError`,
`RegistryError` and `VaultError` enums, or call `describeError(code, "ledger" | "registry" | "vault")`
for a default message.

```ts
try {
  await plimsoll.preparePostReserve(args);
} catch (e) {
  if (e instanceof ContractCallError && e.code === LedgerError.NotReporter) { /* ... */ }
}
```

### `CoveredVaultClient`

`new CoveredVaultClient(TESTNET, TESTNET.coveredVaultId)`, sharing its RPC plumbing with `PlimsollContracts`.

| Method | Returns |
| --- | --- |
| `config()` | `VaultConfig \| null` (`ledger, asset, minBps, maxAge, minTier`) |
| `balance(address)` | `bigint` |
| `prepareDeposit(from, amount)` | unsigned XDR |
| `prepareWithdraw(to, amount)` | unsigned XDR |

### Posting a report

```ts
import { parseUnits, sha256Hex } from "@plimsoll/sdk";
import { signTransaction } from "@stellar/freighter-api";

const xdr = await plimsoll.preparePostReserve({
  reporter: issuer,
  sac,
  amount: parseUnits("1,020,000"),
  asOf: Date.UTC(2026, 9, 5) / 1000,
  docHash: await sha256Hex(await file.arrayBuffer()),
  docUri: "https://example.com/reserves/2026-10.pdf",
});
const { signedTxXdr } = await signTransaction(xdr, {
  networkPassphrase: TESTNET.networkPassphrase,
  address: issuer,
});
const hash = await plimsoll.submit(signedTxXdr);
```

### Managing reporters

Only the registry admin can set or revoke a reporter. Pass the admin address as
the transaction source and have that account sign the prepared XDR. Names are
checked locally to match the contract: 1 to 64 UTF-8 bytes.

```ts
import { Role } from "@plimsoll/sdk";

const admin = await plimsoll.registryAdmin();
const xdr = await plimsoll.prepareSetReporter(admin, reporter, Role.Auditor, "Acme Audit LLP");
const { signedTxXdr } = await signTransaction(xdr, {
  networkPassphrase: TESTNET.networkPassphrase,
  address: admin,
});
const hash = await plimsoll.submit(signedTxXdr);

const revokeXdr = await plimsoll.prepareRevoke(admin, reporter);
```

### `IndexerClient`

| Method | Endpoint |
| --- | --- |
| `listAssets(minTier?)` | `GET /v1/assets` |
| `getAsset(sac, minTier?)` | `GET /v1/assets/{sac}` |
| `supplyHistory(sac, limit?)` | `GET /v1/assets/{sac}/supply` |
| `reportHistory(sac, limit?)` | `GET /v1/assets/{sac}/reports` |
| `reporters()` | `GET /v1/reporters` |
| `network()` | `GET /v1/network` |
| `breakdown(hash)` | `GET /v1/breakdowns/{hash}` (raw bytes) |

### Helpers

| Function | Example |
| --- | --- |
| `formatUnits(10200000000000n)` | `"1,020,000"` |
| `parseUnits("1.5")` | `15000000n` |
| `bpsToPercent(9990)` | `"99.90%"` |
| `coverageStatus(bps, ages, maxAgeSeconds?, minBps?)` | `"covered" \| "under" \| "stale" \| "unknown"` |
| `DEFAULT_MAX_AGE_SECONDS` | freshness default, 7 days |
| `DEFAULT_MIN_BPS` | ratio default, 10,000 (100%) |
| `sacAddress(code, issuer, passphrase)` | the asset's SAC address |
| `sha256Hex(bytes)` / `matchesHash(bytes, hex)` | document checks |

`coverageStatus` defaults `maxAgeSeconds` to `DEFAULT_MAX_AGE_SECONDS` and
`minBps` to `DEFAULT_MIN_BPS` (100%), so its default behaviour is unchanged. A
consumer that requires 102% can pass `10_200`; one that accepts 98% can pass
`9_800`. `unknown` means a report or ratio is missing; `stale` means the report
or supply snapshot is older than the window, whatever the ratio.

```ts
coverageStatus(10_100, { report: 60 }, DEFAULT_MAX_AGE_SECONDS, 10_200); // "under"
coverageStatus(9_900, { report: 60 }, DEFAULT_MAX_AGE_SECONDS, 9_800); // "covered"
```

## Tests

```bash
npm test                      # unit tests
PLIMSOLL_LIVE=1 npm test      # plus reads against the live testnet contracts
```
