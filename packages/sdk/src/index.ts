/**
 * `@sparkhub/sdk` — OAuth client library for browser-based partner apps on SparkHub.
 *
 * See README.md for usage. Quick start:
 *
 * ```ts
 * import { createSparkhubClient } from '@sparkhub/sdk';
 *
 * const client = createSparkhubClient({
 *   clientId: 'papp_...',
 *   scopes: ['partner-app:read'],
 *   redirectUri: window.location.origin + '/auth/callback',
 * });
 *
 * if (!client.isAuthenticated()) await client.authorize();
 * const me = await client.me();
 * ```
 */

export { createSparkhubClient, type SparkhubClient } from './client.js';
export type {
  Connection,
  PartnerAppMe,
  RaasRequest,
  RaasResponse,
  SoapRequest,
  SoapResponse,
  SparkhubClientOptions,
  SparkhubError,
  StartConnectRedirectOptions,
  StorageMode,
  Tenant,
  TokenRefreshEvent,
  TokenRefreshReason,
  TokenResponse,
  WqlRequest,
  WqlResponse,
} from './types.js';
