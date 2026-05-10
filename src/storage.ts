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
