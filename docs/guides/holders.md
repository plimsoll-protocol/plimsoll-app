# For holders and wallets

You hold, or are about to accept, a Stellar-issued asset. Plimsoll tells you
whether it is backed, according to whom, and how recently.

## Read an asset in 30 seconds

1. Open the [app](https://plimsoll-app-gths-amber.vercel.app/) and find the asset.
2. Read the three things on its card:
   * **The ratio.** 100% or more means reported reserves cover everything in circulation.
   * **The status.** *Fully backed*, *Under-backed*, *Report stale* (a report or supply snapshot older than the SDK's seven-day default) or *No data*.
   * **The tier.** *Auditor-signed* is strongest. *Issuer-signed* means the issuer vouched for itself. *Transcribed* means a volunteer copied a published figure.
3. Open the asset page to see every report, its date, its signer and its document.

## Check it yourself

On the asset page:

* **Check on-chain now** reads the contract directly from your browser. It
  does not use Plimsoll's servers.
* **Verify hash** downloads the reserve document and compares its SHA-256 with
  the hash stored on-chain. A mismatch means the document changed after it was
  posted.
* **How supply was counted** shows the six buckets. When the indexer is
  connected, the page also checks that they hash to the on-chain value.

## What a reading does not tell you

A reading is only as good as its signer. An issuer can post a false
figure at the Issuer-signed tier, and the contract will record it. Plimsoll
makes that visible: you always see who signed.

## For wallet builders

Show the ratio and tier next to the balance. One SDK call:

```ts
const cov = await plimsoll.coverage(sac, Tier.Transcribed);
```

See [TypeScript SDK](../developers/sdk.md).
