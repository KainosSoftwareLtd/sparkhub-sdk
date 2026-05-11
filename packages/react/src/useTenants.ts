/**
 * `useTenants()` — React hook over `client.tenants.list()`.
 *
 * Auto-fetches on mount. Exposes `refresh()` for manual refetch (e.g. after
 * returning from a `startConnectRedirect` round-trip).
 *
 * Requires the `partner-app:tenants:read` scope on the active token.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Tenant } from '@sparkhub/sdk';
import { useSparkhub } from './SparkhubProvider.js';

export interface UseTenantsResult {
  tenants: Tenant[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useTenants(): UseTenantsResult {
  const { client, isAuthenticated } = useSparkhub();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setTenants([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const result = await client.tenants.list();
      setTenants(result);
      setError(null);
    } catch (err) {
      setTenants([]);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [client, isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { tenants, isLoading, error, refresh };
}
