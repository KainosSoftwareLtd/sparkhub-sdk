# `@sparkhub/sdk`

Browser-side OAuth client library for partner apps that authenticate against [SparkHub](https://sparkhub.studio).

Hides the OAuth ceremony — PKCE, redirect, code exchange, refresh-on-401 — behind a small surface that mirrors a normal authenticated `fetch()` workflow.

> **Status:** v0 — `0.x` while M1 is in flux; v1 cuts when the first external partner ships. Pre-release semantics: minor versions may include breaking changes.

## Install

While the SDK is in `0.x`, install from a tagged GitHub Release:

```bash
npm i https://github.com/KainosSoftwareLtd/sparkhub-sdk/releases/download/v0.2.0/sparkhub-sdk-0.2.0.tgz
```

(See [Install from a release](#install-from-a-release) below for `package.json` form and version pinning.)

Pure-browser SDK with no runtime dependencies. Targets evergreen browsers (uses `fetch`, `crypto.subtle`, `Web Storage`).

## Quickstart

```ts
import { createSparkhubClient } from '@sparkhub/sdk';

const client = createSparkhubClient({
  clientId: 'papp_...',                                // from your platform admin's registration
  scopes: ['partner-app:read'],
  redirectUri: window.location.origin + '/auth/callback',
  // Optional:
  sparkhubBase: 'https://sparkhub.studio',             // default; override for staging/local
  storage: 'session',                                  // 'session' (default) | 'local'
});

// In your app's main entry:
if (!client.isAuthenticated()) {
  await client.authorize();   // redirects to SparkHub
}

// In your /auth/callback handler:
await client.handleCallback();   // exchanges code for tokens

// Anywhere you need data:
const me = await client.me();    // GET /api/partner-app/me
const stuff = await client.fetch('/api/some/path').then((r) => r.json());

// Logout:
await client.logout();
```

## Method reference

| Method | Behavior |
|---|---|
| `isAuthenticated()` | Synchronous check — true iff a non-expired access token is in storage. |
| `accessToken()` | Returns the current access token string (or `null`). Useful for non-`fetch` callers (e.g. `EventSource`). |
| `authorize()` | Generates PKCE pair, stores verifier + state in `sessionStorage`, redirects to `${sparkhubBase}/oauth/authorize?...`. Never returns. |
| `handleCallback()` | Reads `?code` + `?state` from current URL, validates state + PKCE, exchanges via `POST /oauth/token`, stores tokens, strips OAuth params from URL via `history.replaceState`. Throws on validation failure. |
| `fetch(path, init?)` | `fetch` wrapper. Resolves relative paths against `sparkhubBase`. Attaches `Authorization: Bearer <access>`. On `401`: tries refresh once, retries; if refresh fails, clears storage and throws — your app should redirect to `authorize()`. |
| `me()` | Convenience: `fetch('/api/partner-app/me').then((r) => r.json())`. Throws on non-2xx. |
| `logout()` | Calls `POST /oauth/revoke` with the refresh token, then clears local storage. Best-effort — succeeds locally even if the network call fails. |

## How it works

1. **`authorize()`** — generates a PKCE verifier (random 32-byte base64url), computes the SHA-256 challenge, stores them with a CSRF state in `sessionStorage`, redirects the browser to `${sparkhubBase}/oauth/authorize?...`.

2. **User signs in to SparkHub + approves consent.** SparkHub redirects back to `redirectUri` with `?code=...&state=...`.

3. **`handleCallback()`** — validates the state matches what was stored, validates PKCE record isn't stale (5-min TTL), POSTs `code` + `code_verifier` + `client_id` + `redirect_uri` to `${sparkhubBase}/oauth/token`. Stores returned access + refresh tokens in `sessionStorage` (or `localStorage` if you opted in via `storage: 'local'`).

4. **Authenticated requests** — `client.fetch()` adds `Authorization: Bearer <access>`. If a request returns `401`, the SDK calls `POST /oauth/token` with `grant_type=refresh_token`, gets a new (rotated) access + refresh pair, replays the original request once. If refresh fails, your app should call `client.authorize()` to start a fresh sign-in.

5. **`logout()`** — POSTs the refresh token to `/oauth/revoke` (kills the chain server-side), clears local storage.

## Token storage

Default: `sessionStorage` — cleared when the tab closes. Lowest blast radius if a device is compromised.

Opt in to persistent storage:
```ts
createSparkhubClient({ ...config, storage: 'local' });
```
Use `local` only if your UX needs persist-across-restart auth. Note the trade-off: a refresh token in `localStorage` lives until the chain wall-clock cap (24h for partner-app) regardless of tab lifecycle.

## Multi-tab behavior

Tabs of the same partner app coordinate refresh via [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) and [BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel_API). When multiple tabs hit a 401 simultaneously, only one tab actually calls `/oauth/token`; peer tabs wait at the lock and pick up the rotated tokens from storage. This eliminates the previous failure mode where two tabs racing tripped the server's refresh-reuse-detection and revoked the chain.

Browsers without Web Locks (Safari < 15.4) fall back to per-tab refresh — the SDK still works, but two-tab races against a brand-new partner-app installation might cost an occasional re-auth. Acceptable for evergreen-browser audiences.

The `onTokenRefresh` callback fires on every successful rotation — `reason: 'local'` when this tab did the rotation, `reason: 'peer'` when we picked up tokens written by another tab.

## Configuration

| Option | Default | Notes |
|---|---|---|
| `clientId` | required | Always starts with `papp_`. From the platform-admin registration of your app. |
| `scopes` | required | OAuth scopes to request. Granted scopes = (registry-allowed) ∩ (install-enabled) ∩ (this list). |
| `redirectUri` | required | Must match your app's allowed redirect URI patterns. |
| `sparkhubBase` | `https://sparkhub.studio` | Override for staging/local-dev (`http://localhost:3000` or your kit-configured local hostname). |
| `storage` | `'session'` | `'session'` (cleared on tab close) or `'local'` (persists). |
| `org` | — | Org-code hint for the authorize URL. Required when the redirect URI is `localhost`-style; production redirects at `{org}.{ns}.sparkhub.run` derive it from the subdomain. |
| `onTokenRefresh` | — | Optional callback fired after every successful access-token rotation. See *Multi-tab behavior* above. |

## Errors

All SDK errors implement `SparkhubError`:

```ts
interface SparkhubError extends Error {
  code?: string;     // OAuth error code or SDK-specific code
  status?: number;   // HTTP status, when relevant
}
```

Common `code` values:
- `not_authenticated` — `fetch()` called with no session
- `invalid_state` — CSRF state mismatch in callback (re-authorize)
- `expired_state` — PKCE record older than 5 min in callback
- `token_exchange_failed` — `/oauth/token` returned non-2xx during code exchange
- `refresh_failed` — refresh attempt failed; chain may be revoked

## Server-side / Node.js usage

This SDK is browser-only. If you're building a server-to-server integration (no user, just credentials), use the SparkHub `oauth-integration` audience with `client_credentials` grant — that's a separate flow not covered by this package.

## Compatibility

| Browser | Status |
|---|---|
| Chrome 90+ | Tested |
| Firefox 90+ | Tested |
| Safari 15+ | Tested |
| Edge 90+ | Tested |
| IE | Not supported |

Requires `crypto.subtle`, `fetch`, `URL`, `URLSearchParams`, `sessionStorage`/`localStorage`. All standard in evergreen browsers.

## Install from a release

While the SDK is in `0.x`, releases are distributed as GitHub Release tarballs (npm publish comes later). Install a specific version directly:

```bash
npm i https://github.com/KainosSoftwareLtd/sparkhub-sdk/releases/download/v0.2.0/sparkhub-sdk-0.2.0.tgz
```

Or pin in `package.json`:

```json
{
  "dependencies": {
    "@sparkhub/sdk": "https://github.com/KainosSoftwareLtd/sparkhub-sdk/releases/download/v0.2.0/sparkhub-sdk-0.2.0.tgz"
  }
}
```

Available versions: see the [Releases page](https://github.com/KainosSoftwareLtd/sparkhub-sdk/releases).

## Building from source

```bash
git clone https://github.com/KainosSoftwareLtd/sparkhub-sdk.git
cd sparkhub-sdk
npm install
npm run build       # emits dist/index.js + dist/index.d.ts
```

## Issues / contributions

File issues at [`KainosSoftwareLtd/sparkhub-sdk`](https://github.com/KainosSoftwareLtd/sparkhub-sdk/issues).

## License

MIT
