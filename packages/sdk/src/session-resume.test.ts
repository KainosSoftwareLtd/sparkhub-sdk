/**
 * auth-churn 2.2 — partner-app session resume + duplicated-tab safety.
 *   - a lapsed access token is REFRESHED on mount (`ensureSession`), never a
 *     new authorize;
 *   - a rejected refresh clears the session; a transient one keeps it;
 *   - the server's JWT-only grace answer keeps the stored refresh token;
 *   - a peer tab's rotated pair is adopted only for the same chain and when newer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSparkhubClient } from './client.js';
import { shouldAdoptPeerRecord, type SessionRecord } from './storage.js';

const OPTS = {
  clientId: 'papp_test_abc',
  scopes: ['partner-app:read'],
  redirectUri: 'http://localhost:5173/callback',
  sparkhubBase: 'http://localhost:3000',
};
const KEY = 'sparkhub_partner_app_session';

function seed(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const rec: SessionRecord = {
    accessToken: 'at-old',
    accessTokenExpiresAt: Date.now() - 1000, // lapsed
    refreshToken: 'chain_abc.r1',
    refreshTokenExpiresAt: Date.now() + 24 * 3600 * 1000,
    scopes: ['partner-app:read'],
    clientId: 'papp_test_abc',
    refreshIssuedAt: 1000,
    ...overrides,
  };
  window.sessionStorage.setItem(KEY, JSON.stringify(rec));
  return rec;
}
const stored = (): SessionRecord | null => JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null');
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.restoreAllMocks();
});
afterEach(() => vi.restoreAllMocks());

describe('ensureSession (what the React provider runs on mount)', () => {
  it('refreshes a lapsed access token instead of re-authorizing', async () => {
    seed();
    const fetchSpy = vi
      .spyOn(window, 'fetch')
      .mockResolvedValueOnce(json({ access_token: 'at-new', refresh_token: 'chain_abc.r2', token_type: 'Bearer', expires_in: 300 }));
    const client = createSparkhubClient(OPTS);
    const rec = await client.ensureSession();
    expect(rec?.accessToken).toBe('at-new');
    expect(stored()?.refreshToken).toBe('chain_abc.r2');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/oauth/token');
    expect(client.accessToken()).toBe('at-new');
  });

  it('does nothing when the access token is still fresh', async () => {
    seed({ accessToken: 'at-fresh', accessTokenExpiresAt: Date.now() + 60_000 });
    const fetchSpy = vi.spyOn(window, 'fetch');
    const client = createSparkhubClient(OPTS);
    expect((await client.ensureSession())?.accessToken).toBe('at-fresh');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a REJECTED refresh clears the session (sign in again)', async () => {
    seed();
    vi.spyOn(window, 'fetch').mockResolvedValueOnce(json({ error: 'invalid_grant' }, 400));
    const client = createSparkhubClient(OPTS);
    expect(await client.ensureSession()).toBeNull();
    expect(stored()).toBeNull();
    expect(client.isAuthenticated()).toBe(false);
  });

  it('a TRANSIENT failure (503) keeps the session and rejects with refresh_unavailable', async () => {
    const rec = seed();
    vi.spyOn(window, 'fetch').mockResolvedValueOnce(json({ error: 'temporarily_unavailable' }, 503));
    const client = createSparkhubClient(OPTS);
    await expect(client.ensureSession()).rejects.toMatchObject({ code: 'refresh_unavailable' });
    expect(stored()?.refreshToken).toBe(rec.refreshToken);
  });

  it('the server grace answer (no refresh_token) updates the access token and KEEPS the refresh token', async () => {
    seed();
    vi.spyOn(window, 'fetch').mockResolvedValueOnce(json({ access_token: 'at-grace', token_type: 'Bearer', expires_in: 300 }));
    const client = createSparkhubClient(OPTS);
    const rec = await client.ensureSession();
    expect(rec?.accessToken).toBe('at-grace');
    expect(stored()?.refreshToken).toBe('chain_abc.r1');
    expect(stored()?.refreshIssuedAt).toBe(1000);
  });
});

describe('client.fetch rotates a lapsed access token before the call', () => {
  it('refresh first, then the request with the new bearer — no 401 spent', async () => {
    seed();
    const fetchSpy = vi
      .spyOn(window, 'fetch')
      .mockResolvedValueOnce(json({ access_token: 'at-new', refresh_token: 'chain_abc.r2', token_type: 'Bearer', expires_in: 300 }))
      .mockResolvedValueOnce(json({ ok: true }));
    const client = createSparkhubClient(OPTS);
    const r = await client.fetch('/api/partner-app/me');
    expect(r.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const headers = (fetchSpy.mock.calls[1][1] as RequestInit).headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer at-new');
  });
});

describe('shouldAdoptPeerRecord (duplicated tabs share a copied sessionStorage)', () => {
  const base: SessionRecord = {
    accessToken: 'a',
    accessTokenExpiresAt: 0,
    refreshToken: 'chain_abc.r1',
    refreshTokenExpiresAt: 0,
    scopes: [],
    clientId: 'papp_x',
    refreshIssuedAt: 1000,
  };
  it('adopts a newer pair on the same chain', () => {
    expect(shouldAdoptPeerRecord(base, { ...base, refreshToken: 'chain_abc.r2', refreshIssuedAt: 2000 })).toBe(true);
  });
  it('ignores an older pair', () => {
    expect(shouldAdoptPeerRecord(base, { ...base, refreshToken: 'chain_abc.r0', refreshIssuedAt: 500 })).toBe(false);
  });
  it('never adopts a different chain (another user / org signed in elsewhere)', () => {
    expect(shouldAdoptPeerRecord(base, { ...base, refreshToken: 'chain_zzz.r9', refreshIssuedAt: 9000 })).toBe(false);
  });
  it('never adopts another client', () => {
    expect(shouldAdoptPeerRecord(base, { ...base, clientId: 'papp_y', refreshToken: 'chain_abc.r2', refreshIssuedAt: 2000 })).toBe(false);
  });
  it('nothing to adopt into when signed out', () => {
    expect(shouldAdoptPeerRecord(null, { ...base, refreshIssuedAt: 2000, refreshToken: 'chain_abc.r2' })).toBe(false);
  });
});

describe('peer broadcast', () => {
  it('a tab that rotates broadcasts the new pair; a duplicated tab adopts it', async () => {
    seed();
    const posted: unknown[] = [];
    // Two clients in one jsdom window stand in for two tabs on one channel.
    const tabA = createSparkhubClient(OPTS);
    const channelSpy = vi.spyOn(BroadcastChannel.prototype, 'postMessage').mockImplementation(function (msg) {
      posted.push(msg);
    });
    vi.spyOn(window, 'fetch').mockResolvedValueOnce(
      json({ access_token: 'at-new', refresh_token: 'chain_abc.r2', token_type: 'Bearer', expires_in: 300 }),
    );
    await tabA.ensureSession();
    expect(channelSpy).toHaveBeenCalled();
    const event = posted[0] as { type: string; record?: SessionRecord };
    expect(event.type).toBe('refreshed');
    expect(event.record?.refreshToken).toBe('chain_abc.r2');
    expect(event.record?.refreshIssuedAt).toBeGreaterThan(1000);
  });
});

describe('peer adoption on the receiving tab', () => {
  it('adopts a same-chain newer pair broadcast by another tab', async () => {
    seed();
    const client = createSparkhubClient(OPTS);
    void client; // the client's coordinator is subscribed on construction
    const peer = new BroadcastChannel('sparkhub_partner_app:papp_test_abc');
    const rotated: SessionRecord = {
      ...(stored() as SessionRecord),
      accessToken: 'at-peer',
      accessTokenExpiresAt: Date.now() + 300_000,
      refreshToken: 'chain_abc.r2',
      refreshIssuedAt: 5000,
    };
    peer.postMessage({ type: 'refreshed', record: rotated });
    await new Promise((r) => setTimeout(r, 50));
    peer.close();
    expect(stored()?.refreshToken).toBe('chain_abc.r2');
  });

  it('ignores a different chain', async () => {
    seed();
    createSparkhubClient(OPTS);
    const peer = new BroadcastChannel('sparkhub_partner_app:papp_test_abc');
    peer.postMessage({
      type: 'refreshed',
      record: { ...(stored() as SessionRecord), refreshToken: 'chain_other.r9', refreshIssuedAt: 9000 },
    });
    await new Promise((r) => setTimeout(r, 50));
    peer.close();
    expect(stored()?.refreshToken).toBe('chain_abc.r1');
  });
});
