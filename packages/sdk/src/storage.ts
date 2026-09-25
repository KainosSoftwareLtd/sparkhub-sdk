/**
 * Token + PKCE state storage abstraction.
 *
 * Wraps Web Storage with a typed read/write/clear API. Falls back to an
 * in-memory map if Web Storage isn't available (e.g. SSR contexts where the
 * SDK might be imported before the browser environment is ready).
 */

import type { StorageMode } from './types.js';

const SESSION_KEY = 'sparkhub_partner_app_session';
const PKCE_KEY = 'sparkhub_partner_app_pkce';

interface MinimalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let inMemoryFallback: Map<string, string> | null = null;

function fallbackStorage(): MinimalStorage {
  if (!inMemoryFallback) inMemoryFallback = new Map();
  return {
    getItem: (k) => inMemoryFallback!.get(k) ?? null,
    setItem: (k, v) => {
      inMemoryFallback!.set(k, v);
    },
    removeItem: (k) => {
      inMemoryFallback!.delete(k);
    },
  };
}

function pickStorage(mode: StorageMode): MinimalStorage {
  if (typeof window === 'undefined') return fallbackStorage();
  try {
    if (mode === 'local') return window.localStorage;
    return window.sessionStorage;
  } catch {
    // Storage can throw in private-browsing modes
    return fallbackStorage();
  }
}

export interface SessionRecord {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
  scopes: string[];
  clientId: string;
  /**
   * When `refreshToken` was issued (epoch ms). Orders two copies of the same
   * chain across tabs: a peer's record is adopted only when its refresh token
   * is NEWER than ours. Absent on records written by older SDK versions.
   */
  refreshIssuedAt?: number;
}

/** The chain a refresh token belongs to (`{chainId}.{secret}`), or null. */
export function chainIdOfRefreshToken(refreshToken: string | undefined): string | null {
  if (!refreshToken) return null;
  const idx = refreshToken.indexOf('.');
  if (idx <= 0) return null;
  const chainId = refreshToken.slice(0, idx);
  return chainId.startsWith('chain_') ? chainId : null;
}

/**
 * Should this tab adopt a record a PEER tab broadcast after rotating?
 * Only for the SAME chain (never switch user / org because another tab
 * signed in differently) and only when the peer's refresh token is newer.
 * This is what keeps duplicated tabs (which copy `sessionStorage`) from
 * presenting an already-rotated refresh token — the server treats that as
 * reuse and revokes the chain.
 */
export function shouldAdoptPeerRecord(current: SessionRecord | null, incoming: SessionRecord): boolean {
  if (!current) return false;
  if (current.clientId !== incoming.clientId) return false;
  const chain = chainIdOfRefreshToken(current.refreshToken);
  if (!chain || chain !== chainIdOfRefreshToken(incoming.refreshToken)) return false;
  if (incoming.refreshToken === current.refreshToken) return false;
  return (incoming.refreshIssuedAt ?? 0) > (current.refreshIssuedAt ?? 0);
}

export interface PkceRecord {
  verifier: string;
  state: string;
  redirectUri: string;
  scopes: string[];
  createdAt: number;
}

export class SessionStore {
  private storage: MinimalStorage;

  constructor(mode: StorageMode) {
    this.storage = pickStorage(mode);
  }

  read(): SessionRecord | null {
    const raw = this.storage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionRecord;
    } catch {
      this.storage.removeItem(SESSION_KEY);
      return null;
    }
  }

  write(record: SessionRecord): void {
    this.storage.setItem(SESSION_KEY, JSON.stringify(record));
  }

  clear(): void {
    this.storage.removeItem(SESSION_KEY);
  }
}

export class PkceStore {
  private storage: MinimalStorage;

  constructor() {
    // PKCE state is always session-only — no point in persisting beyond the
    // tab that started the redirect.
    this.storage = pickStorage('session');
  }

  read(): PkceRecord | null {
    const raw = this.storage.getItem(PKCE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PkceRecord;
    } catch {
      this.storage.removeItem(PKCE_KEY);
      return null;
    }
  }

  write(record: PkceRecord): void {
    this.storage.setItem(PKCE_KEY, JSON.stringify(record));
  }

  clear(): void {
    this.storage.removeItem(PKCE_KEY);
  }
}
