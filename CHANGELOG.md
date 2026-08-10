# Changelog

## Unreleased

## [0.5.1] - 2026-08-10

- Fixed `auth status` so it uses configured credentials when listing projects.

## [0.5.0] - 2026-08-10

- Preserved `providers primary` and `providers connect --primary` compatibility: a true primary
  value promotes priority `0`, while `--off` remains a legacy no-op.
- Cost estimation remains anonymous even when a CLI credential is configured.

## [0.4.4] - 2026-08-08

- Updated public ID documentation and validation errors to describe the current typed ID format,
  while preserving strict resource-prefix and suffix validation.

## [0.4.3] - 2026-08-04

- Fixed Cloud API URL normalization to handle long trailing-slash inputs without regular
  expression backtracking.
- Updated the SDK dependency and public development dependency resolution to fix the
  high-severity `brace-expansion` denial-of-service advisory.

## [0.4.2] - 2026-08-02

- Fixed `auth login` to exchange OAuth access tokens for stored API credentials, explain
  post-authorization token failures, and finish the browser response before closing the callback
  server.
- Improved invalid-credential errors with source-specific recovery steps for `--api-key`,
  `BISIBILITY_API_KEY`, and the config file.

## [0.4.1] - 2026-08-02

- Improved authentication errors to distinguish missing and invalid credentials, identify the
  invalid credential source, and provide an actionable login command.

## [0.4.0] - 2026-08-02

- Added daily interactive update notifications plus `bisibility upgrade` and
  `bisibility upgrade --check`, with manager-aware updates for npm, pnpm, and Bun and manual
  fallback instructions for Yarn Classic or unrecognized installations.

## [0.3.0] - 2026-08-02

- Added `saved list`, `saved add`, and `saved delete` commands for managing keyword ideas without
  starting rank tracking.

## [0.2.1] - 2026-07-30

- Improved package metadata to describe the CLI's rank-check and ranking-history commands.

## [0.2.0] - 2026-07-29

- Breaking: require public ID v3 prefixes and `bsb_key_*` or `bsb_pat_live_` credentials.
  Public ID v2 values and legacy `bsk_*` or `bsp_*` credentials are no longer accepted.

## [0.1.2] - 2026-07-29

- Managed Cloud API requests now use the direct EU endpoint, preventing OAuth login from failing
  after browser authorization when authenticated requests reject cross-origin redirects.

## [0.1.1] - 2026-07-29

- Browser login now prints progress and the exact authorization URL immediately, keeps the
  callback listener active when automatic browser opening fails, and confirms successful login.
- `auth logout` now removes local credentials only; pass `--revoke` to revoke the remote token too.
- Self-host authentication documentation now covers both service URLs, loopback callbacks, and
  headless API credentials.

## [0.1.0] - 2026-07-28

- Initial release.
