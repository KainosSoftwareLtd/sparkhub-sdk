# Changelog

## v0.5.0

- **`@sparkhub/kb-viewer`: SparkHub custom-block parity + unknown-block crash guard** (SparkHub CR #1153).
  - **Crash guard**: the incoming document is normalized before mounting — unknown (future) block types degrade to neutral paragraphs (inline text + children preserved), unknown inline types to their plain text, unknown/out-of-range props are dropped; a last-resort error boundary renders the page's plain text. The viewer never throws on unknown content.
  - **Parity renderers** (independent read-only implementations, registered in a viewer-side BlockNote schema): `callout`, `wrappedImage`, `fileAsset`, `drawio` (PNG render asset), `mermaid` (lazy-loaded; DOMPurify-sanitized SVG), plus `mention` (plain text — no user links on anonymous surfaces) and `anchor` (plain `<a>` for external http(s)/mailto URLs; plain text for SparkHub-object anchors) inline content. `codeBlock`/`heading` stay on BlockNote defaults (no shiki highlighting — documented tradeoff).
  - **New prop `resolveAssetUrl?: (assetId: string) => string`** — maps KB asset ids to fetchable URLs for `fileAsset`/`drawio`/`wrappedImage` (block props carry bare asset ids / relative public serve paths); falls back to any URL already in props when omitted.
  - New deps: `mermaid` ^11 + `dompurify` ^3 (regular dependencies like `@blocknote/*`; mermaid is dynamic-imported so pages without diagrams never fetch it). New exports: `viewerSchema`, `normalizeDocument`, `documentPlainText`, `ResolveAssetUrl`. Vitest suite added (`npm -w @sparkhub/kb-viewer test`).
- `@sparkhub/sdk` / `@sparkhub/react`: version bump only (lockstep).

## v0.4.1

- All packages: add the `default` condition to the `exports` map (webpack/Next CJS-path resolution failed with only `types`+`import` — "Package path . is not exported").

## v0.4.0

- **New package: `@sparkhub/kb-viewer`** — read-only BlockNote viewer for SparkHub Knowledge Base content (the `content` block array from the public KB API). Standalone (no OAuth / no `@sparkhub/sdk` dependency): peer `react`/`react-dom` 18|19, deps `@blocknote/{core,react,mantine}` ^0.31. Follows the host page's `data-theme` (or explicit `theme` prop). First consumer: the K-Store portal.
- `@sparkhub/sdk` / `@sparkhub/react`: version bump only (lockstep).

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

## [0.3.1] - 2026-05-12

Trims the half-baked connect-redirect surface and surfaces server-derived connection readiness.

### `@sparkhub/sdk` — breaking

- **Removed** `client.tenants.startConnectRedirect(tenantId, { returnTo })` and `client.tenants.consumeConnectionReturn()`. The matching SparkHub-side landing page (`/tenants/[tenantId]/connect`) is gone. Connection management is SparkHub-internal; partner apps observe `Connection.ready` and surface a "not connected" message without any redirect flow. The `StartConnectRedirectOptions` type is no longer exported.

### `@sparkhub/sdk` — added

- `Connection.ready: boolean` — server-derived "can the app call against this tenant right now?". Single source of truth; partners should NOT derive readiness from raw `state` values.
- `Tenant.connection: Connection | null` — the signed-in user's connection to the tenant, populated inline by `client.tenants.list()`. Removes the need for an N+1 fan-out to `connections(id)` per tenant.

### `@sparkhub/react` — breaking

- **Removed** `<TenantPanel>` and its types (`TenantPanelProps`, `TenantPanelAppearance`). Partner apps build their own combo against `useTenants()` + the new `Tenant.connection.ready` field. `<TenantSidebar>` remains.

### Server-side (SparkHub) — additions reflected in the SDK surface

- "Remember this decision" consent cookie (`sh_v2_pa_consent`, HS256-signed, 90d, HttpOnly, SameSite=Lax). On `/oauth/authorize`, if the requested scopes are a subset of a remembered grant AND the cookie's `sub` matches the signed-in user, the consent screen is skipped and the auth code is minted directly. Audited as `consent.auto-approved`.
- Per-tenant connection state is now joined in `GET /api/partner-app/tenants`. The per-tenant `GET /api/partner-app/tenants/{id}/connections` endpoint remains (unchanged) for callers that want the raw list.

## [0.3.0] - 2026-05-11

M2 platform-services release — adds three substantial new capability surfaces. **The repo is now a workspaces monorepo** publishing two packages in lockstep: `@sparkhub/sdk` (existing) and `@sparkhub/react` (new).

### `@sparkhub/sdk` — added

- **Tenants API** (cluster B): `client.tenants.list()`, `client.tenants.get(id)`, `client.tenants.connections(id)` — read-only access to the org's Workday tenants + per-user connection state. Requires `partner-app:tenants:read`.
- **Connect redirect-out** (cluster B): `client.tenants.startConnectRedirect(tenantId, { returnTo })` navigates the browser to SparkHub's connection-create page (Stripe-Connect pattern). `client.tenants.consumeConnectionReturn()` detects the return-from-SparkHub query params on initial mount and strips them.
- **Workday execution runners** (cluster C): `client.tenants.soap(tenantId, body)`, `client.tenants.raas(tenantId, body)`, `client.tenants.wql(tenantId, body)` — execute Workday operations through SparkHub's stored connection (partner never sees credentials). Body shapes match SparkHub's internal utilities 1:1. Requires `partner-app:tenants:execute`.
- **Managed-storage builder API** (cluster A): `client.data.collection(name).find(...).run()`, `.findOne()`, `.insertOne()`, `.insertMany()`, `.updateOne()`, `.updateMany()`, `.deleteOne()`, `.deleteMany()`, `.count()`. Mirrors SparkHub's internal `mongoGateway`. Requires `partner-app:data:read` / `:write` / `:admin`.
- New types exported: `Tenant`, `Connection`, `StartConnectRedirectOptions`, `SoapRequest`/`Response`, `RaasRequest`/`Response`, `WqlRequest`/`Response`, plus `DataApi`, `DataCollection`, and all data-result shapes.

### `@sparkhub/react` — new package

- `<SparkhubProvider>` + `useSparkhub()` — moved from in-tree example
- `useTenants()`, `useConnections(tenantId)`, `useActiveTenant()` + `ActiveTenantProvider`
- `<TenantSidebar>` — drop-in vertical tenant list with optional environment filter
- `<TenantPanel>` — single-tenant detail + connection state + redirect-out "Connect" button
- Minimal Clerk-style `appearance` API (`colorAccent`, `borderRadius`, `font`)

### Server-side (SparkHub) — additions reflected in the SDK surface

- 5 new OAuth scopes: `partner-app:tenants:read`, `partner-app:tenants:execute`, `partner-app:data:read`, `partner-app:data:write`, `partner-app:data:admin`
- 14 new endpoints under `/api/partner-app/*` (3 tenants + 3 runners + 10-via-dispatcher data ops + 1 connect-page redirect-out landing)

### v1 cuts (cluster A only — explicitly documented in `partner-app-data/CLAUDE_CONTEXT.md`)

- No schema validation on writes
- No per-user `userId` auto-injection
- No lazy index creation on Mongo error 291
- `aggregate` operator returns 501 — needs operator allowlisting before exposing

All deferred to a v2 milestone once `partnerAppRegistry` is extended with a per-collection schema declaration.

### Distribution

Both tarballs published as a single GitHub Release per tag:

```bash
npm i \
  https://github.com/KainosSoftwareLtd/sparkhub-sdk/releases/download/v0.3.0/sparkhub-sdk-0.3.0.tgz \
  https://github.com/KainosSoftwareLtd/sparkhub-sdk/releases/download/v0.3.0/sparkhub-react-0.3.0.tgz
```

## [0.2.0] - 2026-05-10

### Added

- **Cross-tab refresh coordination** via Web Locks + BroadcastChannel. Multiple tabs of the same partner app no longer race on token refresh — only one tab does the network rotation, peers wait at the lock and pick up the new tokens. Eliminates the previous failure mode where two tabs racing tripped server-side refresh-reuse-detection and revoked the chain. Falls back gracefully to per-tab refresh on browsers without Web Locks (Safari < 15.4).
- **`onTokenRefresh` option** on `createSparkhubClient`. Fires after a successful refresh, both when this tab did the rotation (`reason: 'local'`) and when a peer tab did and we picked up the new tokens via cross-tab broadcast (`reason: 'peer'`). Useful for telemetry, mirroring the access token to a non-default storage layer, or driving a UI indicator. Errors thrown from this callback are swallowed.
- **`TokenRefreshEvent` and `TokenRefreshReason` types** exported from the package root.

### Changed

- **`TokenResponse.scope` is now optional** (`string | undefined`). Aligns the type with reality — the `/oauth/token` refresh response omits `scope`, only the initial code-exchange response includes it. Refresh now correctly carries scopes forward from the previous session record. **Breaking** for direct consumers of the `TokenResponse` type, but the typed client API is unchanged.
- **`TokenResponse.refresh_expires_in` is now read** (when the server returns it) instead of always assuming the 24h `refreshTokenFixedTtlSeconds` default. Server-side support for emitting this field is pending — until then, the SDK silently falls back to 24h. Forward-compatible: when the server starts emitting it, the SDK picks it up automatically.

### Fixed

- **`PartnerAppMe` type now matches the actual server response shape.** Previously declared `issuedAt`, `expiresAt`, `chainExpiresAt` as `number` (epoch ms) but the server returns them as ISO 8601 strings — partner code reading them as numbers got `NaN`. Now correctly typed as `string` (and `string | null` for `chainExpiresAt`). Added the missing `chainId: string` field. **Breaking** for any code that did arithmetic on these fields directly — switch to `Date.parse(me.expiresAt)`.

### Internals

- New `RefreshCoordinator` module (`src/coordinator.ts`). Internal — not exported.
- **Vitest test suite** added with jsdom environment. 38 tests covering PKCE, storage, refresh coordination, client.fetch (bearer + 401 retry + dedupe + onTokenRefresh + scope carry-forward), and handleCallback (state validation, CSRF mismatch, PKCE TTL).
- **CI gate** — release workflow now runs `npm test` before building the tarball; failing tests block the release.
- **React example** — `examples/minimal-react/` is now a complete Vite + React app with a copy-pasteable `<SparkhubProvider>` + `useSparkhub()` hook.

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
