/**
 * SparkHub partner-app browser client.
 *
 * Hides the OAuth ceremony — PKCE, redirect, code exchange, refresh — behind
 * a small surface modeled after a normal authenticated `fetch()` workflow.
 */

import type {
  PartnerAppMe,
  SparkhubClientOptions,
  SparkhubError,
  TokenResponse,
} from './types.js';
import { generatePkcePair, generateRandomBase64Url } from './pkce.js';
import {
  PkceStore,
  SessionStore,
  type PkceRecord,
  type SessionRecord,
} from './storage.js';

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
  private refreshInFlight: Promise<SessionRecord | null> | null = null;

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
        const record = this.session.read();
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
        const next = sessionRecordFromTokens(this.clientId, tokens);
        this.session.write(next);
        return next;
      } catch {
        return null;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }
}

function sessionRecordFromTokens(clientId: string, tokens: TokenResponse): SessionRecord {
  const now = Date.now();
  return {
    accessToken: tokens.access_token,
    accessTokenExpiresAt: now + tokens.expires_in * 1000,
    refreshToken: tokens.refresh_token,
    // Refresh TTL not returned by /oauth/token directly — the partner-app
    // audience uses a fixed 24h window so we encode that here. If the server
    // ever returns refresh_expires_in, prefer that.
    refreshTokenExpiresAt: now + 24 * 60 * 60 * 1000,
    scopes: tokens.scope.split(' ').filter(Boolean),
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
