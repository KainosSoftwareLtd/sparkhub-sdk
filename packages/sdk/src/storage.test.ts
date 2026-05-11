import { afterEach, describe, it, expect, beforeEach } from 'vitest';
import { SessionStore, PkceStore, type SessionRecord, type PkceRecord } from './storage.js';

const sampleSession = (): SessionRecord => ({
  accessToken: 'access-abc',
  accessTokenExpiresAt: Date.now() + 60_000,
  refreshToken: 'refresh-xyz',
  refreshTokenExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
  scopes: ['partner-app:read'],
  clientId: 'papp_test',
});

const samplePkce = (): PkceRecord => ({
  verifier: 'verifier-abc',
  state: 'state-xyz',
  redirectUri: 'http://localhost:5173/callback',
  scopes: ['partner-app:read'],
  createdAt: Date.now(),
});

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe('SessionStore', () => {
  it('round-trips a session record via sessionStorage', () => {
    const store = new SessionStore('session');
    const record = sampleSession();
    store.write(record);
    expect(store.read()).toEqual(record);
  });

  it('round-trips a session record via localStorage when mode=local', () => {
    const store = new SessionStore('local');
    const record = sampleSession();
    store.write(record);
    expect(store.read()).toEqual(record);
    // Should also be readable via the underlying localStorage
    const raw = window.localStorage.getItem('sparkhub_partner_app_session');
    expect(raw).not.toBeNull();
  });

  it('returns null when no record is stored', () => {
    const store = new SessionStore('session');
    expect(store.read()).toBeNull();
  });

  it('clears the stored record', () => {
    const store = new SessionStore('session');
    store.write(sampleSession());
    expect(store.read()).not.toBeNull();
    store.clear();
    expect(store.read()).toBeNull();
  });

  it('returns null + clears storage on malformed JSON (defensive)', () => {
    window.sessionStorage.setItem('sparkhub_partner_app_session', '{not-valid-json');
    const store = new SessionStore('session');
    expect(store.read()).toBeNull();
    expect(window.sessionStorage.getItem('sparkhub_partner_app_session')).toBeNull();
  });

  it('session and local stores use the same key but different storage backends', () => {
    const sessionStore = new SessionStore('session');
    const localStore = new SessionStore('local');
    sessionStore.write({ ...sampleSession(), accessToken: 'session-only' });
    localStore.write({ ...sampleSession(), accessToken: 'local-only' });
    expect(sessionStore.read()?.accessToken).toBe('session-only');
    expect(localStore.read()?.accessToken).toBe('local-only');
  });
});

describe('PkceStore', () => {
  it('round-trips a PKCE record', () => {
    const store = new PkceStore();
    const record = samplePkce();
    store.write(record);
    expect(store.read()).toEqual(record);
  });

  it('always uses sessionStorage regardless of caller intent', () => {
    const store = new PkceStore();
    store.write(samplePkce());
    // Should be in sessionStorage, not localStorage
    expect(window.sessionStorage.getItem('sparkhub_partner_app_pkce')).not.toBeNull();
    expect(window.localStorage.getItem('sparkhub_partner_app_pkce')).toBeNull();
  });

  it('returns null when no record is stored', () => {
    const store = new PkceStore();
    expect(store.read()).toBeNull();
  });

  it('clears the stored record', () => {
    const store = new PkceStore();
    store.write(samplePkce());
    expect(store.read()).not.toBeNull();
    store.clear();
    expect(store.read()).toBeNull();
  });
});
