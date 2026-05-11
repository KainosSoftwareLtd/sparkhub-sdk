/**
 * `useConnections(tenantId)` — React hook over `client.tenants.connections()`.
 *
 * Auto-fetches whenever `tenantId` changes. Returns an empty array when
 * `tenantId` is null (caller hasn't selected a tenant yet).
 */

import { useCallback, useEffect, useState } from 'react';
import type { Connection } from '@sparkhub/sdk';
import { useSparkhub } from './SparkhubProvider.js';

export interface UseConnectionsResult {
  connections: Connection[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useConnections(tenantId: string | null): UseConnectionsResult {
  const { client, isAuthenticated } = useSparkhub();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !tenantId) {
      setConnections([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const result = await client.tenants.connections(tenantId);
      setConnections(result);
      setError(null);
    } catch (err) {
      setConnections([]);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [client, isAuthenticated, tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { connections, isLoading, error, refresh };
}
