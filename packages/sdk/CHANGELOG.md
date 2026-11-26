# Changelog

All notable changes to `@plimsoll/sdk` are documented here. This project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and the
format of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `IndexerClient.reconcileStatus(sac?)` reads `GET /v1/reconcile`, the last run
  of the indexer's state reconciler, optionally for one asset. A `404` from an
  indexer without the endpoint resolves to `null` rather than throwing.
- `subscribeCoverageEvents` takes an `onStateChange` callback and reports
  `"connecting"`, `"live"` and `"paused"`, so a caller can say that live
  updates are paused and clear that when the stream returns. A connection that
  opens now resets the reconnect back-off.

## [0.1.0] - 2026-11-24

### Added

- Initial release of `@plimsoll/sdk`.
- `PlimsollContracts` for reading the coverage ledger and reporter registry
  through Soroban RPC simulation, plus prepared (unsigned) write transactions.
- `IndexerClient` for the Plimsoll indexer API.
- Formatting helpers (`formatUnits`, `bpsToPercent`) and hash verification
  (`matchesHash`, `parseBreakdown`).
- `TESTNET` network configuration for the v0.1 testnet deployment.

[0.1.0]: https://github.com/plimsoll-protocol/plimsoll-app/releases/tag/sdk-v0.1.0