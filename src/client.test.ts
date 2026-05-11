import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSparkhubClient } from './client.js';
import type { TokenResponse } from './types.js';

const VALID_OPTS = {
  clientId: 'papp_test_abc',
  scopes: ['partner-app:read'],
  redirectUri: 'http://localhost:5173/callback',
  sparkhubBase: 'http://localhost:3000',
};

const tokenResponse = (overrides: Partial<TokenResponse> = {}): TokenResponse => ({
  access_token: 'access-token-1',
  refresh_token: 'refresh-token-1',
  token_type: 'Bearer',
  expires_in: 300,
  scope: 'partner-app:read',
  ...overrides,
});

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSparkhubClient — option validation', () => {
  it('throws when clientId does not start with papp_', () => {
    expect(() =>
      createSparkhubClient({ ...VALID_OPTS, clientId: 'wrong_prefix' }),
    ).toThrow(/papp_/);
  });

  it('throws when scopes is empty', () => {
    expect(() =>
      createSparkhubClient({ ...VALID_OPTS, scopes: [] }),
    ).toThrow(/scope/);
  });

  it('throws when redirectUri is missing', () => {
    expect(() =>
      createSparkhubClient({ ...VALID_OPTS, redirectUri: '' }),
    ).toThrow(/redirectUri/);
  });
});

describe('client.isAuthenticated / accessToken', () => {
  it('returns false when no session is stored', () => {
    const client = createSparkhubClient(VALID_OPTS);
    expect(client.isAuthenticated()).toBe(false);
    expect(client.accessToken()).toBeNull();
  });

  it('returns false for an expired session', () => {
    window.sessionStorage.setItem(
      'sparkhub_partner_app_session',
      JSON.stringify({
        accessToken: 'expired',
        accessTokenExpiresAt: Date.now() - 1000,
        refreshToken: 'r',
        refreshTokenExpiresAt: Date.now() + 1000,
        scopes: [],
        clientId: 'papp_test_abc',
      }),
    );
    const client = createSparkhubClient(VALID_OPTS);
    expect(client.isAuthenticated()).toBe(false);
    expect(client.accessToken()).toBeNull();
  });

  it('returns true and the access token for a fresh session', () => {
    window.sessionStorage.setItem(
      'sparkhub_partner_app_session',
      JSON.stringify({
        accessToken: 'fresh',
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: 'r',
        refreshTokenExpiresAt: Date.now() + 24 * 3600 * 1000,
        scopes: ['partner-app:read'],
        clientId: 'papp_test_abc',
      }),
    );
    const client = createSparkhubClient(VALID_OPTS);
    expect(client.isAuthenticated()).toBe(true);
    expect(client.accessToken()).toBe('fresh');
  });
});

describe('client.fetch — bearer + 401 retry', () => {
  it('attaches the Authorization: Bearer header', async () => {
    window.sessionStorage.setItem(
      'sparkhub_partner_app_session',
      JSON.stringify({
        accessToken: 'token-1',
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: 'r',
        refreshTokenExpiresAt: Date.now() + 24 * 3600 * 1000,
        scopes: ['partner-app:read'],
        clientId: 'papp_test_abc',
      }),
    );
    const fetchSpy = vi
      .spyOn(window, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const client = createSparkhubClient(VALID_OPTS);

    await client.fetch('/api/partner-app/me');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledWith = fetchSpy.mock.calls[0];
    const headers = (calledWith[1] as RequestInit).headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-1');
  });

  it('refreshes once and retries the request on 401', async () => {
    window.sessionStorage.setItem(
      'sparkhub_partner_app_session',
      JSON.stringify({
        accessToken: 'old-token',
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: 'r1',
        refreshTokenExpiresAt: Date.now() + 24 * 3600 * 1000,
        scopes: ['partner-app:read'],
        clientId: 'papp_test_abc',
      }),
    );

    const fetchSpy = vi.spyOn(window, 'fetch');
    fetchSpy
      .mockResolvedValueOnce(new Response('{"error":"expired"}', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(tokenResponse({ access_token: 'new-token' })), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const client = createSparkhubClient(VALID_OPTS);
    const response = await client.fetch('/api/partner-app/me');

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3); // initial 401 + token + retry
    // Final retry should use the new bearer
    const retryHeaders = (fetchSpy.mock.calls[2][1] as RequestInit).headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer new-token');
  });

  it('throws refresh_failed when the refresh attempt fails', async () => {
    window.sessionStorage.setItem(
      'sparkhub_partner_app_session',
      JSON.stringify({
        accessToken: 'old-token',
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: 'r1',
        refreshTokenExpiresAt: Date.now() + 24 * 3600 * 1000,
        scopes: ['partner-app:read'],
        clientId: 'papp_test_abc',
      }),
    );

    const fetchSpy = vi.spyOn(window, 'fetch');
    fetchSpy
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"error":"invalid_grant"}', { status: 400 }));

    const client = createSparkhubClient(VALID_OPTS);
    await expect(client.fetch('/api/partner-app/me')).rejects.toMatchObject({
      code: 'refresh_failed',
    });
    // Storage should be cleared
    expect(window.sessionStorage.getItem('sparkhub_partner_app_session')).toBeNull();
  });

  it('throws not_authenticated when no session exists', async () => {
    const client = createSparkhubClient(VALID_OPTS);
    await expect(client.fetch('/api/partner-app/me')).rejects.toMatchObject({
      code: 'not_authenticated',
    });
  });

  it('fires onTokenRefresh on successful local refresh', async () => {
    window.sessionStorage.setItem(
      'sparkhub_partner_app_session',
      JSON.stringify({
        accessToken: 'old-token',
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: 'r1',
        refreshTokenExpiresAt: Date.now() + 24 * 3600 * 1000,
        scopes: ['partner-app:read'],
        clientId: 'papp_test_abc',
      }),
    );

    const onTokenRefresh = vi.fn();

    const fetchSpy = vi.spyOn(window, 'fetch');
    fetchSpy
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(tokenResponse({ access_token: 'rotated-token' })), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const client = createSparkhubClient({ ...VALID_OPTS, onTokenRefresh });
    await client.fetch('/api/partner-app/me');

    expect(onTokenRefresh).toHaveBeenCalledOnce();
    const event = onTokenRefresh.mock.calls[0][0];
    expect(event.reason).toBe('local');
    expect(event.accessToken).toBe('rotated-token');
    expect(event.scopes).toEqual(['partner-app:read']);
  });

  it('uses server-returned refresh_expires_in when present', async () => {
    window.sessionStorage.setItem(
      'sparkhub_partner_app_session',
      JSON.stringify({
        accessToken: 'old',
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: 'r',
        refreshTokenExpiresAt: Date.now() + 24 * 3600 * 1000,
        scopes: ['partner-app:read'],
        clientId: 'papp_test_abc',
      }),
    );
    const fetchSpy = vi.spyOn(window, 'fetch');
    const refreshBody = {
      access_token: 'rotated',
      refresh_token: 'r2',
      token_type: 'Bearer',
      expires_in: 300,
      refresh_expires_in: 3600, // 1 hour, not the 24h default
    };
    fetchSpy
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(refreshBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const beforeRefresh = Date.now();
    const client = createSparkhubClient(VALID_OPTS);
    await client.fetch('/api/partner-app/me');

    const stored = JSON.parse(window.sessionStorage.getItem('sparkhub_partner_app_session')!);
    // Stored refresh expiry should be ~1h from now, not ~24h
    const expectedRange = beforeRefresh + 3600 * 1000;
    expect(stored.refreshTokenExpiresAt).toBeGreaterThanOrEqual(expectedRange - 5000);
    expect(stored.refreshTokenExpiresAt).toBeLessThanOrEqual(expectedRange + 5000);
  });

  it('falls back to 24h refresh expiry when server omits refresh_expires_in', async () => {
    window.sessionStorage.setItem(
      'sparkhub_partner_app_session',
      JSON.stringify({
        accessToken: 'old',
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: 'r',
        refreshTokenExpiresAt: Date.now() + 24 * 3600 * 1000,
        scopes: ['partner-app:read'],
        clientId: 'papp_test_abc',
      }),
    );
    const fetchSpy = vi.spyOn(window, 'fetch');
    const refreshBody = {
      access_token: 'rotated',
      refresh_token: 'r2',
      token_type: 'Bearer',
      expires_in: 300,
      // refresh_expires_in: omitted intentionally
    };
    fetchSpy
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(refreshBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const beforeRefresh = Date.now();
    const client = createSparkhubClient(VALID_OPTS);
    await client.fetch('/api/partner-app/me');

    const stored = JSON.parse(window.sessionStorage.getItem('sparkhub_partner_app_session')!);
    // Stored refresh expiry should be ~24h from now
    const expected = beforeRefresh + 24 * 3600 * 1000;
    expect(stored.refreshTokenExpiresAt).toBeGreaterThanOrEqual(expected - 5000);
    expect(stored.refreshTokenExpiresAt).toBeLessThanOrEqual(expected + 5000);
  });

  it('refresh request carries the granted scopes forward when the refresh response omits scope', async () => {
    window.sessionStorage.setItem(
      'sparkhub_partner_app_session',
      JSON.stringify({
        accessToken: 'old-token',
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: 'r1',
        refreshTokenExpiresAt: Date.now() + 24 * 3600 * 1000,
        scopes: ['partner-app:read', 'partner-app:trigger-process'],
        clientId: 'papp_test_abc',
      }),
    );

    const fetchSpy = vi.spyOn(window, 'fetch');
    // /oauth/token refresh response with NO scope field (matches partner-app server)
    const refreshBody = {
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      token_type: 'Bearer',
      expires_in: 300,
    };
    fetchSpy
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(refreshBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const client = createSparkhubClient(VALID_OPTS);
    await client.fetch('/api/partner-app/me');

    // Storage now has rotated tokens with prior scopes preserved
    const stored = JSON.parse(window.sessionStorage.getItem('sparkhub_partner_app_session')!);
    expect(stored.accessToken).toBe('new-access');
    expect(stored.scopes).toEqual(['partner-app:read', 'partner-app:trigger-process']);
  });
});

describe('client.handleCallback', () => {
  const setLocation = (href: string) => {
    // jsdom Location has navigation side-effects; mock the bits we use.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        href,
        search: new URL(href).search,
        pathname: new URL(href).pathname,
      },
    });
  };

  it('rejects when the OAuth callback URL has no code', async () => {
    setLocation('http://localhost:5173/callback');
    const client = createSparkhubClient(VALID_OPTS);
    await expect(client.handleCallback()).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('rejects when there is no PKCE record (forgotten authorize() call)', async () => {
    setLocation('http://localhost:5173/callback?code=xyz&state=abc');
    const client = createSparkhubClient(VALID_OPTS);
    await expect(client.handleCallback()).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('rejects on state mismatch (CSRF defense)', async () => {
    window.sessionStorage.setItem(
      'sparkhub_partner_app_pkce',
      JSON.stringify({
        verifier: 'v',
        state: 'expected-state',
        redirectUri: 'http://localhost:5173/callback',
        scopes: ['partner-app:read'],
        createdAt: Date.now(),
      }),
    );
    setLocation('http://localhost:5173/callback?code=xyz&state=different-state');
    const client = createSparkhubClient(VALID_OPTS);
    await expect(client.handleCallback()).rejects.toMatchObject({ code: 'invalid_state' });
    // PKCE record should be cleared on mismatch
    expect(window.sessionStorage.getItem('sparkhub_partner_app_pkce')).toBeNull();
  });

  it('rejects when PKCE record is older than 5 minutes', async () => {
    window.sessionStorage.setItem(
      'sparkhub_partner_app_pkce',
      JSON.stringify({
        verifier: 'v',
        state: 'st',
        redirectUri: 'http://localhost:5173/callback',
        scopes: ['partner-app:read'],
        createdAt: Date.now() - 10 * 60 * 1000,
      }),
    );
    setLocation('http://localhost:5173/callback?code=xyz&state=st');
    const client = createSparkhubClient(VALID_OPTS);
    await expect(client.handleCallback()).rejects.toMatchObject({ code: 'expired_state' });
  });
});
