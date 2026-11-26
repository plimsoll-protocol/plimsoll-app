# Lifecycle of a reading

An asset moves through four states. Coverage exists only in the last two.

```
 unlisted ──list_asset──▶ listed ──post_supply──▶ supply known ──post_reserve──▶ covered reading
                            │                                                       │
                            └──post_reserve──▶ report known ──post_supply──────────┘
```

| State | Has | `coverage()` returns |
| --- | --- | --- |
| Unlisted | nothing | `None`; posts are rejected with `AssetNotListed` |
| Listed | `AssetRecord` | `None` |
| One side known | supply **or** a report | `None` |
| Covered reading | supply **and** at least one report at or above `min_tier` | `Some(Coverage)` |

## Step by step

### 1. List

Anyone calls `list_asset(sac)`. The contract checks that `sac` is a genuine
Stellar Asset Contract, reads `name()` (for example
`PUSD:GBIE3ANCRVCBWETUZXWYKRMP27LQVJHX757XXAQUT3LYHVTNFPPPXEY4`), splits it into
code and issuer, and stores the record. Native XLM is rejected: it has no
issuer and no reserves.

### 2. Post supply

The indexer's poster account (registered with the `SupplyPoster` role) calls
`post_supply(poster, sac, amount, ledger, breakdown_hash)`. `ledger` must be
newer than the stored snapshot and not newer than the current ledger.

The poster posts when supply changes, and at least every 6 hours otherwise.
That keeps `is_covered` freshness checks passing for consumers that use a
short `max_age`.

### 3. Post reserves

A reporter calls `post_reserve(reporter, sac, amount, as_of, doc_hash,
doc_uri)`. The contract sets the tier from who the reporter is. `as_of` must
not be in the future, and must be later than the last report **at the same
tier**. Different tiers have independent histories.

### 4. Read

`coverage(sac, min_tier)` takes the latest supply snapshot and, among tiers
at or above `min_tier`, the report with the latest `as_of`. A tie goes to the
stronger tier. `is_covered` adds two checks: freshness of both inputs, and
the ratio.

## What happens over time

Readings do not expire on-chain; they age. `coverage()` keeps returning the
last figures, and the caller decides how old is too old through `max_age`.
The app labels a reading **stale** when the report or the supply snapshot is
more than the SDK's `DEFAULT_MAX_AGE_SECONDS` (seven days) old. Open a status
pill for the rule and a link to [coverage math](coverage-math.md).
