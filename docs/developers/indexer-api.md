# Indexer API

JSON over HTTP. Amounts are strings in smallest units. Times are RFC 3339 UTC.
CORS is open by default.

## `GET /v1/assets/{sac}`

Query: `min_tier` (1–3, default 1).

```bash
curl localhost:8080/v1/assets/CCHPT4TEJDPZQDSUVW3NP6A35ROGV4WEFZKT45SKWYCFZSUB7R5HIM7S
```

```json
{
  "sac": "CCHPT4TEJDPZQDSUVW3NP6A35ROGV4WEFZKT45SKWYCFZSUB7R5HIM7S",
  "code": "PUSD",
  "issuer": "GBIE3ANCRVCBWETUZXWYKRMP27LQVJHX757XXAQUT3LYHVTNFPPPXEY4",
  "listed_ledger": 5034484,
  "toml": null,
  "toml_error": "issuer has no home_domain",
  "supply": {
    "amount": "10000000000000",
    "ledger": 5034657,
    "posted_at": "2026-10-05T10:41:22Z",
    "breakdown_hash": "3fbbfd04297fb438c40a54434ae8a73ad501714a14b13981a4efdf86e4fbaa0c",
    "poster": "GDACI55IMI5DDZWMZ2EAXWK57AV75VE4626YYBAHQJYDV7QFPNNFK6HJ",
    "tx_hash": "c3ae90c40b1dbf0575e0e9babaefd9ae20dee457fb5b37d2d40105f005f6b81b"
  },
  "reports": {
    "issuer_signed": {
      "tier": "issuer_signed",
      "amount": "10200000000000",
      "as_of": "2026-10-05T00:00:00Z",
      "reporter": "GBIE3ANCRVCBWETUZXWYKRMP27LQVJHX757XXAQUT3LYHVTNFPPPXEY4",
      "doc_hash": "716d103038531110f3080aa830466cdf1df12fbaaf18247f142776740ca1c7ff",
      "doc_uri": "https://raw.githubusercontent.com/dunnidev/plimsoll-contracts/main/docs/demo/pusd-reserves-2026-10.md",
      "tx_hash": "2b41a94efe4cf881ab097ce9b8e0e14f4cf90f9cc4fe38958b9b9d18e7bb9c0c"
    },
    "auditor_signed": { "tier": "auditor_signed", "amount": "10150000000000", "as_of": "2026-10-04T00:00:00Z" }
  },
  "coverage": {
    "bps": 10200,
    "ratio": "102.00%",
    "tier": "issuer_signed",
    "supply": "10000000000000",
    "reserves": "10200000000000",
    "supply_ledger": 5034657,
    "report_as_of": "2026-10-05T00:00:00Z",
    "report_age_seconds": 38697,
    "supply_age_seconds": 215
  }
}
```

`coverage` is `null` until there is a supply snapshot and a qualifying
report. `coverage.bps` is `null` when supply is zero.

## Other endpoints

| Endpoint | Returns |
| --- | --- |
| `GET /healthz` | `{"status":"ok","ingested_to_ledger":5034661}`; 503 if the database is down |
| `GET /v1/network` | `network_passphrase`, `rpc_url`, `horizon_url`, `coverage_ledger_id`, `reporter_registry_id` |
| `GET /v1/assets` | `{"assets":[…]}`, same shape as above |
| `GET /v1/assets/{sac}/supply?limit=100` | `{"supply":[…]}`, newest first |
| `GET /v1/assets/{sac}/reports?limit=100` | `{"reports":[…]}`, newest first |
| `GET /v1/reporters` | `{"reporters":[{"address","role","name","updated_at"}]}` |
| `GET /v1/reconcile?asset={sac}` | The state reconciler's last run, optionally for one asset |
| `GET /v1/assets/{sac}/events` | `text/event-stream` of new snapshots and reports |
| `GET /v1/reporters` | `{"reporters":[{"address","role","name","updated_at","reputation"}]}`; `reputation` is optional when no score is available |
| `GET /v1/breakdowns/{hash}` | The exact bytes that were hashed |

## `GET /v1/reconcile`

The state reconciler reads each listed asset's `get_supply` and `get_report`
back from the coverage ledger every `RECONCILE_INTERVAL` (15 minutes by
default) and stores anything newer than event ingestion has, which repairs gaps
longer than RPC's event retention. This endpoint says what the job last did.
Pass `?asset={sac}` to narrow it to one asset.

```json
{
  "running": true,
  "interval_seconds": 900,
  "last_run_at": "2026-11-24T09:15:02Z",
  "last_run_outcome": "ok",
  "assets": [
    {
      "sac": "CCHPT4TEJDPZQDSUVW3NP6A35ROGV4WEFZKT45SKWYCFZSUB7R5HIM7S",
      "last_run_at": "2026-11-24T09:15:02Z",
      "outcome": "ok",
      "recovered_supply": 0,
      "recovered_reports": 1,
      "error": null
    }
  ]
}
```

An indexer older than this endpoint answers `404`, which the app reports as
"Reconciler not running" rather than as an error. The asset page asks for it
lazily from the browser, so no other page depends on it.

## `GET /v1/assets/{sac}/events`

`text/event-stream` for one asset: one JSON object per `data:` line, with the
same shapes the REST endpoints return. Each event carries a `kind` of
`supply_posted`, `report_posted` or `coverage_changed`.

`subscribeCoverageEvents` in `@plimsoll/sdk` wraps the stream with exponential
back-off and an `onStateChange` callback. The asset page refreshes its figures
when an event arrives, and shows "Live updates paused — reconnecting…" only
after a stream that had opened drops. A deployment whose indexer does not serve
the stream never opens, so it stays quiet instead of claiming to reconnect.

## Verifying a breakdown

```bash
curl -s localhost:8080/v1/breakdowns/3fbbfd04…baa0c | sha256sum
# 3fbbfd04297fb438c40a54434ae8a73ad501714a14b13981a4efdf86e4fbaa0c  -
```

```json
{"asset":"PUSD:GBIE3…XEY4","ledger":5034657,"authorized":"10000000000000",
 "authorized_to_maintain_liabilities":"0","unauthorized":"0","claimable_balances":"0",
 "liquidity_pools":"0","contracts":"0","total":"10000000000000"}
```

## Errors

`400` for bad parameters, `404` for unknown assets or hashes, `500` otherwise.
The body is `{"error": "message"}`.
