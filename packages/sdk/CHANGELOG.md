# Changelog

All notable changes to `@plimsoll/sdk` are documented here. This project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and the
format of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `PlimsollContracts.getAssetMetadata(sac)` returns `{ code, issuer, displayName }`
  from the coverage ledger's `asset_metadata` view, falling back to the
  Stellar Asset Contract's `name()` on a ledger deployed without it.
- `AssetMeta` type and the `decodeAssetMeta`, `parseSacName` and
  `isMissingFunctionError` helpers.

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