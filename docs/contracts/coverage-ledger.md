# coverage-ledger

Records supply snapshots and reserve reports for listed assets, and answers
coverage questions.

## Functions

| Function | Parameters | Returns | Who can call | Triggered by |
| --- | --- | --- | --- | --- |
| `__constructor` | `admin: Address, registry: Address` | — | deployer | deployment |
| `list_asset` | `sac: Address` | `AssetRecord` | anyone | the app's List page |
| `post_supply` | `poster, sac, amount: i128, ledger: u32, breakdown_hash: BytesN<32>` | — | a `SupplyPoster` (auth: `poster`) | the indexer, on change or every 6 h |
| `post_reserve` | `reporter, sac, amount: i128, as_of: u64, doc_hash: BytesN<32>, doc_uri: String` | `Tier` | issuer, auditor or transcriber (auth: `reporter`) | the app's Report page |
| `get_asset` | `sac` | `Option<AssetRecord>` | anyone | reads |
| `get_supply` | `sac` | `Option<SupplySnapshot>` | anyone | reads |
| `get_report` | `sac, tier: Tier` | `Option<ReserveReport>` | anyone | reads |
| `coverage` | `sac, min_tier: Tier` | `Option<Coverage>` | anyone | the app; other contracts |
| `is_covered` | `sac, min_bps: u32, max_age: u64, min_tier: Tier` | `bool` | anyone | other contracts |
| `admin` / `registry` | — | `Address` | anyone | reads |
| `transfer_admin` | `new_admin` | — | admin and new admin | handover |
| `upgrade` | `wasm_hash` | — | admin | contract upgrade |

## Rules

* **Listing** accepts only an address whose executable is the built-in Stellar
  Asset Contract. Code and issuer are parsed from its `name()`. Native XLM is
  rejected.
* **Tier** is set by who posts: the asset's issuer → `IssuerSigned`; registry
  `Auditor` → `AuditorSigned`; registry `Transcriber` → `Transcribed`. Anyone
  else, including a `SupplyPoster`, gets `NotReporter`.
* **Ordering:** a new supply snapshot needs a strictly greater `ledger`, not
  above the current ledger. A new report needs a strictly greater `as_of` than
  the last report at the same tier, not in the future.
* **Selection:** `coverage` uses the latest report by `as_of` among tiers at or
  above `min_tier`; ties go to the stronger tier.

## Errors

| Code | Name | When |
| --- | --- | --- |
| 1 | `NotAStellarAsset` | `list_asset` on a non-SAC address, or on native XLM |
| 2 | `AlreadyListed` | listing twice |
| 3 | `AssetNotListed` | posting for an unlisted asset |
| 4 | `NotSupplyPoster` | `post_supply` from an address without that role |
| 5 | `NotReporter` | `post_reserve` from an address that is not the issuer, an auditor or a transcriber |
| 6 | `InvalidAmount` | negative amount |
| 7 | `FutureLedger` | supply `ledger` above the current ledger |
| 8 | `StaleLedger` | supply `ledger` not newer than the stored one |
| 9 | `FutureTimestamp` | report `as_of` in the future |
| 10 | `StaleReport` | report `as_of` not newer than the last at the same tier |
| 11 | `InvalidUri` | `doc_uri` empty or over 256 bytes |
| 12 | `ImplausibleAmount` | reserve figure outside 0.01% to 10,000% of stored supply |
| 13 | `TooManyReporters` | asset already has maximum of 4 active reporters at this tier |

## Events

| Event | Topics | Data |
| --- | --- | --- |
| `asset_listed` | `sac` | `code`, `issuer` |
| `supply_posted` | `sac` | `amount`, `ledger`, `breakdown_hash`, `poster` |
| `reserve_posted` | `sac`, `tier` | `amount`, `as_of`, `reporter`, `doc_hash`, `doc_uri` |
| `admin_transferred` | `new_admin` | — |

## Example

```bash
stellar contract invoke --network testnet --send=no \
  --id CC2QQ7R4FLPHZP7KA5AO4IASXXICTG6N4GQXCXITTEBNYQEYTYXKMN4D -- \
  coverage --sac CCHPT4TEJDPZQDSUVW3NP6A35ROGV4WEFZKT45SKWYCFZSUB7R5HIM7S --min_tier 1
```

```json
{"bps":10200,"report_as_of":1791158400,"reserves":"10200000000000",
 "supply":"10000000000000","supply_ledger":5034657,"supply_timestamp":1791196882,"tier":2}
```
