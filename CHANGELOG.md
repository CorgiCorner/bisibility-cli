# Changelog

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
