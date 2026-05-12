/**
 * SparkHub partner-app browser client.
 *
 * Hides the OAuth ceremony — PKCE, redirect, code exchange, refresh — behind
 * a small surface modeled after a normal authenticated `fetch()` workflow.
 */

import type {
  Connection,
  PartnerAppMe,
  RaasRequest,
  RaasResponse,
  SoapRequest,
  SoapResponse,
  SparkhubClientOptions,
  SparkhubError,
  Tenant,
  TokenRefreshEvent,
  TokenResponse,
  WqlRequest,
  WqlResponse,
} from './types.js';
import { generatePkcePair, generateRandomBase64Url } from './pkce.js';
import {
  PkceStore,
  SessionStore,
  type PkceRecord,
  type SessionRecord,
} from './storage.js';
import { RefreshCoordinator } from './coordinator.js';
import { createDataApi, type DataApi } from './data-client.js';

const DEFAULT_BASE = 'https://sparkhub.studio';
const PKCE_TTL_MS = 5 * 60 * 1000;

class SparkhubClient {
  private readonly clientId: string;
  private readonly scopes: string[];
  private readonly redirectUri: string;
  private readonly base: string;
  private readonly org: string | undefined;
  private readonly session: SessionStore;
  private readonly pkce: PkceStore;
  private readonly coordinator: RefreshCoordinator;
  private readonly onTokenRefresh: SparkhubClientOptions['onTokenRefresh'];
  private refreshInFlight: Promise<SessionRecord | null> | null = null;
  /** Managed-storage API — `client.data.collection(name).find(...).run()` etc. */
  readonly data: DataApi;

  constructor(opts: SparkhubClientOptions) {
    if (!opts.clientId.startsWith('papp_')) {
      throw new Error('SparkhubClient: clientId must start with "papp_"');
    }
    if (!opts.scopes?.length) {
      throw new Error('SparkhubClient: at least one scope is required');
    }
    if (!opts.redirectUri) {
      throw new Error('SparkhubClient: redirectUri is required');
    }

    this.clientId = opts.clientId;
    this.scopes = opts.scopes;
    this.redirectUri = opts.redirectUri;
    this.base = (opts.sparkhubBase ?? DEFAULT_BASE).replace(/\/$/, '');
    this.org = opts.org;
    this.session = new SessionStore(opts.storage ?? 'session');
    this.pkce = new PkceStore();
    this.onTokenRefresh = opts.onTokenRefresh;
    this.coordinator = new RefreshCoordinator({
      clientId: this.clientId,
      onPeerEvent: (event) => {
        if (event.type !== 'refreshed') return;
        const fresh = this.session.read();
        if (!fresh) return;
        this.fireOnTokenRefresh(fresh, 'peer');
      },
    });
    this.data = createDataApi(
      (path, init) => this.fetch(path, init),
      (code, message, status) => asSparkhubError(code, message, status),
    );
  }

  isAuthenticated(): boolean {
    const record = this.session.read();
    if (!record) return false;
    return record.accessTokenExpiresAt > Date.now();
  }

  accessToken(): string | null {
    const record = this.session.read();
    if (!record) return null;
    if (record.accessTokenExpiresAt <= Date.now()) return null;
    return record.accessToken;
  }

  async authorize(): Promise<never> {
    const { verifier, challenge } = await generatePkcePair();
    const state = generateRandomBase64Url(24);
    const pkceRecord: PkceRecord = {
      verifier,
      state,
      redirectUri: this.redirectUri,
      scopes: this.scopes,
      createdAt: Date.now(),
    };
    this.pkce.write(pkceRecord);

    const url = new URL('/oauth/authorize', this.base);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('scope', this.scopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (this.org) {
      url.searchParams.set('org', this.org);
    }

    window.location.assign(url.toString());
    // assign() never returns; cast for TS
    return new Promise<never>(() => undefined);
  }

  async handleCallback(): Promise<SessionRecord> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
      this.pkce.clear();
      throw asSparkhubError(error, params.get('error_description') ?? error);
    }
    if (!code || !state) {
      throw asSparkhubError('invalid_request', 'callback URL missing code or state');
    }

    const pkceRecord = this.pkce.read();
    if (!pkceRecord) {
      throw asSparkhubError('invalid_state', 'PKCE state missing — re-authorize');
    }
    if (pkceRecord.state !== state) {
      this.pkce.clear();
      throw asSparkhubError('invalid_state', 'state mismatch — possible CSRF');
    }
    if (Date.now() - pkceRecord.createdAt > PKCE_TTL_MS) {
      this.pkce.clear();
      throw asSparkhubError('expired_state', 'PKCE state too old — re-authorize');
    }

    const tokens = await this.exchangeCode(code, pkceRecord);
    const record = sessionRecordFromTokens(this.clientId, tokens);
    this.session.write(record);
    this.pkce.clear();
    this.coordinator.broadcast({ type: 'signed-in' });

    // Strip OAuth params from URL so the page can be bookmarked / refreshed
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('code');
    cleanUrl.searchParams.delete('state');
    cleanUrl.searchParams.delete('error');
    cleanUrl.searchParams.delete('error_description');
    window.history.replaceState({}, '', cleanUrl.toString());

    return record;
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const record = this.session.read();
    if (!record) throw asSparkhubError('not_authenticated', 'no session — call authorize()');

    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${record.accessToken}`);

    const url = path.startsWith('http')
      ? path
      : `${this.base}${path.startsWith('/') ? '' : '/'}${path}`;
    let response = await window.fetch(url, { ...init, headers });

    if (response.status !== 401) return response;

    // 401 — try a refresh once, then retry
    const refreshed = await this.refresh();
    if (!refreshed) {
      // Refresh failed — chain dead, force re-auth
      this.session.clear();
      throw asSparkhubError('refresh_failed', 'session expired');
    }

    headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
    response = await window.fetch(url, { ...init, headers });
    return response;
  }

  async me(): Promise<PartnerAppMe> {
    const r = await this.fetch('/api/partner-app/me');
    if (!r.ok) {
      throw asSparkhubError('me_failed', `me() returned ${r.status}`, r.status);
    }
    return (await r.json()) as PartnerAppMe;
  }

  /**
   * Tenants surface (cluster B). Read-only access to the org's Workday
   * tenants + per-user connection state. Connection management is
   * SparkHub-internal — partner apps observe `Connection.ready` and
   * surface a "not connected" message; they do NOT trigger connect flows.
   *
   * All methods require the `partner-app:tenants:read` scope on the
   * active token (server returns 403 `insufficient_scope` otherwise).
   */
  readonly tenants = {
    list: async (): Promise<Tenant[]> => {
      const r = await this.fetch('/api/partner-app/tenants');
      if (!r.ok) {
        throw asSparkhubError('tenants_list_failed', `tenants.list() returned ${r.status}`, r.status);
      }
      const body = (await r.json()) as { tenants: Tenant[] };
      return body.tenants;
    },

    get: async (tenantId: string): Promise<Tenant> => {
      const r = await this.fetch(`/api/partner-app/tenants/${encodeURIComponent(tenantId)}`);
      if (!r.ok) {
        const code = r.status === 404 ? 'tenant_not_found' : 'tenants_get_failed';
        throw asSparkhubError(code, `tenants.get() returned ${r.status}`, r.status);
      }
      const body = (await r.json()) as { tenant: Tenant };
      return body.tenant;
    },

    connections: async (tenantId: string): Promise<Connection[]> => {
      const r = await this.fetch(
        `/api/partner-app/tenants/${encodeURIComponent(tenantId)}/connections`,
      );
      if (!r.ok) {
        const code = r.status === 404 ? 'tenant_not_found' : 'tenants_connections_failed';
        throw asSparkhubError(
          code,
          `tenants.connections() returned ${r.status}`,
          r.status,
        );
      }
      const body = (await r.json()) as { connections: Connection[] };
      return body.connections;
    },

    /**
     * Execute a Workday SOAP operation against a tenant. SparkHub injects
     * its stored connection — partner never sees Workday credentials.
     *
     * Requires `partner-app:tenants:execute` scope on the active token.
     * Throws `SparkhubError` on transport/auth failure; resolves with
     * `{ ok: false, error, error_description }` on Workday-side error.
     */
    soap: async (tenantId: string, body: SoapRequest): Promise<SoapResponse> => {
      return this.runRunner<SoapResponse>(`/api/partner-app/tenants/${encodeURIComponent(tenantId)}/soap`, body, 'soap');
    },

    /** Execute a Workday RAAS report. See `.soap()` for auth + error semantics. */
    raas: async (tenantId: string, body: RaasRequest): Promise<RaasResponse> => {
      return this.runRunner<RaasResponse>(`/api/partner-app/tenants/${encodeURIComponent(tenantId)}/raas`, body, 'raas');
    },

    /** Execute a Workday WQL query. See `.soap()` for auth + error semantics. */
    wql: async (tenantId: string, body: WqlRequest): Promise<WqlResponse> => {
      return this.runRunner<WqlResponse>(`/api/partner-app/tenants/${encodeURIComponent(tenantId)}/wql`, body, 'wql');
    },
  };

  private async runRunner<T>(path: string, body: unknown, label: string): Promise<T> {
    const r = await this.fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      throw asSparkhubError(
        `${label}_run_failed`,
        `tenants.${label}() returned ${r.status}`,
        r.status,
      );
    }
    return (await r.json()) as T;
  }

  async logout(): Promise<void> {
    const record = this.session.read();
    if (record) {
      try {
        await window.fetch(`${this.base}/oauth/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            token: record.refreshToken,
            client_id: this.clientId,
            token_type_hint: 'refresh_token',
          }),
        });
      } catch {
        // Best-effort; clear local state regardless
      }
    }
    this.session.clear();
    this.pkce.clear();
    this.coordinator.broadcast({ type: 'signed-out' });
  }

  // --- internal ---

  private async exchangeCode(code: string, pkceRecord: PkceRecord): Promise<TokenResponse> {
    const response = await window.fetch(`${this.base}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.clientId,
        redirect_uri: pkceRecord.redirectUri,
        code_verifier: pkceRecord.verifier,
      }),
    });
    if (!response.ok) {
      const errBody = await safeReadJson(response);
      throw asSparkhubError(
        errBody?.error ?? 'token_exchange_failed',
        errBody?.error_description ?? `token exchange returned ${response.status}`,
        response.status,
      );
    }
    return (await response.json()) as TokenResponse;
  }

  private async refresh(): Promise<SessionRecord | null> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      try {
        // Snapshot the access token we know is dead — the one that triggered
        // the 401 caller is retrying. Once we hold the cross-tab lock, we
        // compare against this to detect "peer refreshed while I was waiting".
        const beforeLock = this.session.read();
        const staleAccessToken = beforeLock?.accessToken;

        return await this.coordinator.withLock(async () => {
          // Inside the lock — re-read storage. A peer tab may have already
          // refreshed and written new tokens before we acquired the lock.
          const current = this.session.read();
          if (current && current.accessToken !== staleAccessToken) {
            this.fireOnTokenRefresh(current, 'peer');
            return current;
          }

          const record = current ?? beforeLock;
          if (!record) return null;
          if (record.refreshTokenExpiresAt <= Date.now()) return null;

          const response = await window.fetch(`${this.base}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: record.refreshToken,
              client_id: this.clientId,
            }),
          });
          if (!response.ok) return null;

          const tokens = (await response.json()) as TokenResponse;
          const next = sessionRecordFromTokens(this.clientId, tokens, record.scopes);
          this.session.write(next);
          this.fireOnTokenRefresh(next, 'local');
          this.coordinator.broadcast({ type: 'refreshed' });
          return next;
        });
      } catch {
        return null;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  private fireOnTokenRefresh(record: SessionRecord, reason: 'local' | 'peer'): void {
    if (!this.onTokenRefresh) return;
    const event: TokenRefreshEvent = {
      reason,
      accessToken: record.accessToken,
      accessTokenExpiresAt: record.accessTokenExpiresAt,
      scopes: record.scopes,
    };
    try {
      this.onTokenRefresh(event);
    } catch {
      // Errors in user-supplied callbacks must not break refresh
    }
  }
}

const DEFAULT_REFRESH_TTL_SECONDS = 24 * 60 * 60;

function sessionRecordFromTokens(
  clientId: string,
  tokens: TokenResponse,
  fallbackScopes?: string[],
): SessionRecord {
  const now = Date.now();
  // The /oauth/token refresh response omits `scope`; carry the prior record's
  // granted scopes forward via `fallbackScopes`. The initial code-exchange
  // response always includes `scope`.
  const scopes = tokens.scope
    ? tokens.scope.split(' ').filter(Boolean)
    : fallbackScopes ?? [];
  // Server-returned refresh TTL when present (post server-side rollout of
  // `refresh_expires_in`); otherwise fall back to the partner-app audience's
  // configured fixed TTL of 24h.
  const refreshTtlSeconds = tokens.refresh_expires_in ?? DEFAULT_REFRESH_TTL_SECONDS;
  return {
    accessToken: tokens.access_token,
    accessTokenExpiresAt: now + tokens.expires_in * 1000,
    refreshToken: tokens.refresh_token,
    refreshTokenExpiresAt: now + refreshTtlSeconds * 1000,
    scopes,
    clientId,
  };
}

async function safeReadJson(response: Response): Promise<{ error?: string; error_description?: string } | null> {
  try {
    return (await response.json()) as { error?: string; error_description?: string };
  } catch {
    return null;
  }
}

function asSparkhubError(code: string, message: string, status?: number): SparkhubError {
  const err = new Error(message) as SparkhubError;
  err.code = code;
  err.status = status;
  return err;
}

export function createSparkhubClient(opts: SparkhubClientOptions): SparkhubClient {
  return new SparkhubClient(opts);
}

export type { SparkhubClient };
