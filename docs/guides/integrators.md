# For protocol integrators

Lending pools, vaults, routers and payment contracts can refuse an asset that
is under-backed or whose figures are out of date, with one cross-contract
call.

## Choose your thresholds

| Parameter | Typical value | Meaning |
| --- | --- | --- |
| `min_bps` | `10000` | Reserves must cover 100% of supply |
| `max_age` | `604800` | Supply snapshot and report both under 7 days old |
| `min_tier` | `2` (IssuerSigned) | Ignore transcribed-only figures |

Stricter settings are safer and fail more often. Decide what your contract
does when the answer is `false`. The safe pattern, used by `covered-vault`, is
to **block new exposure but never block exits**.

## Call it from Rust

```rust
use soroban_sdk::{contractclient, contracttype, Address, Env};

#[contracttype]
#[derive(Clone, Copy)]
#[repr(u32)]
pub enum Tier { Transcribed = 1, IssuerSigned = 2, AuditorSigned = 3 }

#[contractclient(name = "CoverageLedgerClient")]
pub trait CoverageLedger {
    fn is_covered(env: Env, sac: Address, min_bps: u32, max_age: u64, min_tier: Tier) -> bool;
}

pub fn require_covered(env: &Env, ledger: &Address, asset: &Address) {
    let ok = CoverageLedgerClient::new(env, ledger)
        .is_covered(asset, &10_000, &604_800, &Tier::IssuerSigned);
    if !ok {
        panic!("asset not covered");
    }
}
```

## Need the number, not a yes/no?

`coverage(sac, min_tier)` returns the full reading (`bps`, `supply`,
`reserves`, `tier`, timestamps), or `None`. Use it to scale a loan-to-value
ratio, for example.

## Embed a coverage watchlist

The static app includes an iframe-friendly watchlist at `/widget/`. Pass one
`sac` query parameter per Stellar Asset Contract address. It shows each
asset's coverage status, refreshes every 60 seconds, and follows the viewer's
system light or dark theme. Invalid addresses are ignored, and the widget
accepts up to 20 unique assets per URL.

```html
<iframe
  src="https://your-plimsoll-site.example/widget/?sac=CCHPT4TEJDPZQDSUVW3NP6A35ROGV4WEFZKT45SKWYCFZSUB7R5HIM7S&sac=CBSQEFG73RMUVEZ56EFEBCJ23WZNF6FFYXEAJKYG6SZCLKDZ5B2YXGHS"
  width="100%"
  height="240"
  title="Plimsoll coverage watchlist"
  loading="lazy"
  style="border: 0"
></iframe>
```

Add or remove repeated `sac` parameters to customize the list. Use the
deployed app's base path in the iframe URL when the static site is hosted
under a subdirectory.

## Test against it locally

Register the real contracts in your tests from the wasm in
[plimsoll-contracts releases](https://github.com/plimsoll-protocol/plimsoll-contracts/releases),
or depend on the crates by git and use `env.register(CoverageLedger, ...)` as
the `covered-vault` tests do.

## Cost

`is_covered` reads up to four storage entries: the supply snapshot and one
report per tier at or above `min_tier`.
In the testnet demo, a full vault deposit including the check cost
0.1468325 XLM.
