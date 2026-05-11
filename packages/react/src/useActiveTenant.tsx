/**
 * `useActiveTenant()` — React state for the partner app's currently-selected
 * tenant. Independent of the tenant list itself — partners decide which
 * tenant is "active" (the one their UI is operating against).
 *
 * Stored in a top-level React context (provider mounted by
 * `<SparkhubProvider>`) so any descendant component can read or update it.
 *
 * Optional localStorage persistence — set `persist: 'localStorage'` on the
 * provider to survive reload. The storage key is namespaced by the partner
 * app's `clientId` to avoid collisions when two apps share a domain.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSparkhub } from './SparkhubProvider.js';

interface ActiveTenantState {
  activeTenantId: string | null;
  setActiveTenant: (tenantId: string | null) => void;
}

const ActiveTenantContext = createContext<ActiveTenantState | null>(null);

const STORAGE_KEY_PREFIX = 'sparkhub_active_tenant:';

export interface ActiveTenantProviderProps {
  children: ReactNode;
  /** Persist active-tenant choice across reloads. Default: in-memory only. */
  persist?: 'localStorage' | 'sessionStorage' | 'memory';
}

export function ActiveTenantProvider({
  children,
  persist = 'memory',
}: ActiveTenantProviderProps) {
  const { client } = useSparkhub();
  // Namespace the storage key by clientId — two partner apps on the same
  // domain (theoretical today) wouldn't see each other's active tenant.
  const storageKey = `${STORAGE_KEY_PREFIX}${(client as unknown as { clientId?: string }).clientId ?? 'default'}`;

  const [activeTenantId, setActiveTenantIdState] = useState<string | null>(() => {
    if (persist === 'memory' || typeof window === 'undefined') return null;
    try {
      const store = persist === 'localStorage' ? window.localStorage : window.sessionStorage;
      return store.getItem(storageKey);
    } catch {
      return null;
    }
  });

  const setActiveTenant = useMemo(
    () => (tenantId: string | null) => {
      setActiveTenantIdState(tenantId);
      if (persist !== 'memory' && typeof window !== 'undefined') {
        try {
          const store = persist === 'localStorage' ? window.localStorage : window.sessionStorage;
          if (tenantId == null) store.removeItem(storageKey);
          else store.setItem(storageKey, tenantId);
        } catch {
          /* storage failures are non-fatal */
        }
      }
    },
    [persist, storageKey],
  );

  // Re-sync from storage if the persistence mode changes mid-session
  useEffect(() => {
    if (persist === 'memory' || typeof window === 'undefined') return;
    try {
      const store = persist === 'localStorage' ? window.localStorage : window.sessionStorage;
      const stored = store.getItem(storageKey);
      if (stored !== activeTenantId) setActiveTenantIdState(stored);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist, storageKey]);

  const value = useMemo<ActiveTenantState>(
    () => ({ activeTenantId, setActiveTenant }),
    [activeTenantId, setActiveTenant],
  );

  return <ActiveTenantContext.Provider value={value}>{children}</ActiveTenantContext.Provider>;
}

export function useActiveTenant(): ActiveTenantState {
  const ctx = useContext(ActiveTenantContext);
  if (!ctx) {
    // Soft fallback — if no ActiveTenantProvider is mounted, return a
    // local-state shim. This lets callers use the hook even when the
    // provider isn't wired (partner just uses their own state).
    throw new Error(
      'useActiveTenant() requires <ActiveTenantProvider> in the tree, or use a local useState instead.',
    );
  }
  return ctx;
}
