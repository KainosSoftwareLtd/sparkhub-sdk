/**
 * Public TypeScript types for `@sparkhub/sdk`.
 *
 * These mirror the shapes returned by the SparkHub partner-app OAuth audience.
 * If the server changes a response shape, bump the SDK version + update here.
 */

export type StorageMode = 'session' | 'local';

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
}

export interface PartnerAppMe {
  userId: string;
  organizationCode: string;
  organizationId: string;
  orgRole: string;
  scope: string[];
  clientId: string;
  issuedAt: number;
  expiresAt: number;
  chainExpiresAt: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
}

export interface SparkhubError extends Error {
  /** Error code from the OAuth server, when available (`invalid_grant`, `invalid_request`, etc.). */
  code?: string;
  /** HTTP status from the failed response. */
  status?: number;
}
