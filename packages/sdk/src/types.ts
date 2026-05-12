/**
 * Public TypeScript types for `@sparkhub/sdk`.
 *
 * These mirror the shapes returned by the SparkHub partner-app OAuth audience.
 * If the server changes a response shape, bump the SDK version + update here.
 */

export type StorageMode = 'session' | 'local';

/**
 * Reason a refresh event fired. `local` = this tab did the network refresh;
 * `peer` = another tab in the same browser did it and we picked up the new
 * tokens via cross-tab broadcast.
 */
export type TokenRefreshReason = 'local' | 'peer';

export interface TokenRefreshEvent {
  reason: TokenRefreshReason;
  /** New access token (already stored). Same as `client.accessToken()` immediately after this fires. */
  accessToken: string;
  /** Wall-clock ms epoch when the access token expires. */
  accessTokenExpiresAt: number;
  /** Granted scopes for the new token (carried over from the previous record on refresh). */
  scopes: string[];
}

export interface SparkhubClientOptions {
  /** Partner-app client ID issued by SparkHub at registration time. Always starts with `papp_`. */
  clientId: string;
  /** OAuth scopes to request. The intersection of (registry-allowed, install-enabled, this list) is what gets granted. */
  scopes: string[];
  /** Where SparkHub should redirect after consent. Must match the partner-app's allowed redirect URI patterns. */
  redirectUri: string;
  /** SparkHub host. Defaults to `https://sparkhub.studio` (production). */
  sparkhubBase?: string;
  /**
   * Org-code hint for the authorize URL (passed as `?org=<code>`).
   * REQUIRED when the redirect URI doesn't carry the org via subdomain
   * (e.g. `http://localhost:3001/...` in dev). Production deployments at
   * `https://{org}.{namespace}.sparkhub.run` extract the org from the
   * subdomain automatically — no `org` needed.
   */
  org?: string;
  /** Token storage mode. `session` (default, cleared on tab close) or `local` (persists across sessions). */
  storage?: StorageMode;
  /**
   * Fired after a successful access-token refresh, both when this tab did
   * the rotation (`reason: 'local'`) and when a peer tab did and we picked
   * up the new tokens via cross-tab broadcast (`reason: 'peer'`).
   *
   * Useful for telemetry, mirroring the access token to a non-default
   * storage layer, or driving a UI indicator. The handler runs after
   * storage is updated, so `client.accessToken()` already returns the new
   * value when this fires.
   *
   * Errors thrown from this callback are swallowed — they do NOT abort
   * the refresh.
   */
  onTokenRefresh?: (event: TokenRefreshEvent) => void;
}

export interface PartnerAppMe {
  userId: string;
  /** Slug-style org code from the JWT principal — what surfaces in URLs (`{org}.{ns}.sparkhub.run`). */
  organizationCode: string;
  /** Mongo ObjectId of the org as a hex string. */
  organizationId: string;
  /** Org role granted by the partner-app install (e.g. `org:admin`). */
  orgRole: string;
  /** Granted scopes on the active access token. */
  scope: string[];
  /** Partner-app client ID (`papp_*`). */
  clientId: string;
  /** Refresh-chain ID (`chain_*`). Stable for the lifetime of the sign-in. */
  chainId: string;
  /** ISO 8601 timestamp — when the access token was issued. */
  issuedAt: string;
  /** ISO 8601 timestamp — when the access token expires. */
  expiresAt: string;
  /** ISO 8601 timestamp — when the refresh chain hits its wall-clock cap. `null` if the chain record is missing (rare). */
  chainExpiresAt: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  /** Access token TTL in seconds. */
  expires_in: number;
  /**
   * Refresh token TTL in seconds. May be omitted by older server versions
   * — the SDK falls back to a hardcoded 24h assumption that matches the
   * partner-app audience's `refreshTokenFixedTtlSeconds` config.
   */
  refresh_expires_in?: number;
  /** Space-separated granted scopes. Returned on initial code exchange; may be omitted on refresh responses. */
  scope?: string;
}

export interface SparkhubError extends Error {
  /** Error code from the OAuth server, when available (`invalid_grant`, `invalid_request`, etc.). */
  code?: string;
  /** HTTP status from the failed response. */
  status?: number;
}

/**
 * What partner apps see for a tenant.
 *
 * Subset of SparkHub's internal `WorkdayTenant` schema — credentials,
 * federated-IdP config, color picker metadata, and audit fields stay
 * SparkHub-internal.
 */
export interface Tenant {
  /** SparkHub tenant identifier (MongoDB ObjectId as hex string). */
  id: string;
  /** Display name set by the org admin. */
  name: string;
  /** Optional description. */
  description?: string;
  /** Environment type (sandbox / impl / preview / production / other). */
  type: string;
  /** Tenant operational status — partners use this to gate "can I call against this?" */
  status: string;
  /** Workday host this tenant points at, e.g. `acme.workday.com`. */
  host: string;
  /** Optional UI color tag — partners can mirror SparkHub's color coding in their own UI. */
  color?: string;
  /**
   * The signed-in user's connection to this tenant (server-joined).
   * `null` if the user has no connection record yet. Partners should read
   * `connection.ready` for "can I call against this tenant?" — single
   * source of truth, no client-side state derivation.
   */
  connection: Connection | null;
}

/**
 * What partner apps see for a tenant's connection state.
 *
 * Partners should read `ready` to decide whether they can call against the
 * tenant — `state` is exposed for diagnostics only. The server is the
 * single source of truth for readiness; do NOT derive it client-side.
 */
export interface Connection {
  /** Connection record ID (opaque to partner). */
  id: string;
  /** Parent tenant ID. */
  tenantId: string;
  /** Auth method backing this connection. */
  type: 'oauth' | 'username_password';
  /** Connection liveness state (raw — most partners should use `ready` instead). */
  state: 'connected' | 'standby' | 'user_pwd' | 'disabled' | 'disconnected';
  /** Server-derived "can the app call against this tenant right now?". */
  ready: boolean;
  /** ISO 8601 — when SparkHub last verified this connection works. `null` if never verified. */
  lastConnectedAt: string | null;
}

// ---------- Workday execution runners (cluster C) ----------
// Field names mirror SparkHub's internal utility shapes 1:1.

export interface SoapRequest {
  /** Workday web service code (e.g. "Human_Resources"). */
  webservice: string;
  /** Operation name (e.g. "Get_Workers"). */
  operation: string;
  /** Workday API version (e.g. "v44.2"). */
  version: string;
  /** Structured payload — server builds the SOAP envelope. Mutually exclusive with `xmlRequest`. */
  data?: Record<string, unknown>;
  /** Pre-built SOAP body XML. Mutually exclusive with `data`. */
  xmlRequest?: string;
  /** Include Workday_Common_Header. Default true. */
  includeCommonHeader?: boolean;
  /** `json` (default) or `xml`. */
  responseFormat?: 'json' | 'xml';
}

export interface SoapResponse {
  ok: boolean;
  durationMs: number;
  response: unknown;
  statusCode?: number;
  error?: string;
  error_description?: string;
}

export interface RaasRequest {
  /** Either `{owner}/{name}` or a full Workday RAAS URL. Server resolves serviceHost + tenant from the SparkHub connection. */
  reportUrl: string;
  /** Default `json`. */
  format?: 'json' | 'xml' | 'csv';
  /** Prompt parameters. */
  parameters?: Record<string, string>;
}

export interface RaasResponse {
  ok: boolean;
  durationMs: number;
  data: unknown;
  statusCode?: number;
  error?: string;
  error_description?: string;
}

export interface WqlRequest {
  query: string;
  /** Default 100, max 1000. */
  limit?: number;
  /** For paginated reads. */
  offset?: number;
}

export interface WqlResponse {
  ok: boolean;
  durationMs: number;
  rows: unknown[];
  totalRows: number | null;
  statusCode?: number;
  error?: string;
  error_description?: string;
}
