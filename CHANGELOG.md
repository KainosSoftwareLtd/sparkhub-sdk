# Changelog

All notable changes to `@sparkhub/sdk` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) — with the pre-1.0 caveat below.

## Pre-1.0 semver policy

While the SDK is in `0.x.y`:

- **`0.x` → `0.(x+1)`** (minor bump) MAY contain breaking API changes. Read the changelog before upgrading.
- **`0.x.y` → `0.x.(y+1)`** (patch bump) is non-breaking — bug fixes, internal changes, additive type refinements.

Once we cut `1.0.0` (when the first external partner ships and the surface stabilizes), strict SemVer applies — breaking changes only on major bumps.

What counts as breaking, even pre-1.0:

- Removing or renaming a public method or option on `createSparkhubClient`
- Changing the return shape of a public method
- Changing default values for an option in a way that alters behavior
- Tightening type signatures in a way that fails to compile previously valid code
- Changing the shape of values stored in `sessionStorage` / `localStorage` (forces re-auth)

Additive changes (new optional options, new methods, new exports, new types) are non-breaking.

## [Unreleased]

## [0.1.0] - 2026-05-10

Initial public release. Source extracted from the `KainosSoftwareLtd/SparkHub` monorepo (`packages/sparkhub-sdk`) into this dedicated repository for partner-facing distribution.

### Added

- `createSparkhubClient(options)` factory returning a `SparkhubClient` instance
- OAuth flow methods: `authorize()`, `handleCallback()`, `logout()`
- Token state helpers: `isAuthenticated()`, `accessToken()`
- Authenticated HTTP wrapper: `fetch(path, init?)` with bearer attach + auto-refresh on 401
- Convenience method: `me()` (wraps `GET /api/partner-app/me`)
- PKCE-S256 implementation via Web Crypto (no dependencies)
- Storage abstraction: `sessionStorage` (default) or `localStorage`, with in-memory fallback for SSR
- TypeScript types: `SparkhubClientOptions`, `PartnerAppMe`, `TokenResponse`, `SparkhubError`, `StorageMode`
- Browser ESM bundle, ~3.7 KB gzipped, no runtime dependencies
- Examples: `vanilla-html` (working), `minimal-react` (placeholder, scheduled for v0.2)
- GitHub Actions release workflow — tag `v*` produces a GitHub Release with a built `.tgz` attached

### Distribution

Partners install from a tagged release URL (npm publish deferred):

```bash
npm i https://github.com/KainosSoftwareLtd/sparkhub-sdk/releases/download/v0.1.0/sparkhub-sdk-0.1.0.tgz
```
