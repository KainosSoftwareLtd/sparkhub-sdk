/**
 * `<TenantPanel>` — single-tenant detail view + connection state.
 *
 * Read-only by design. The "Connect" / "Reconnect" button triggers a
 * browser navigation to SparkHub's connection-create UI via
 * `client.tenants.startConnectRedirect()` — partner never sees Workday
 * credentials. After the ceremony completes, SparkHub redirects back to
 * the partner app with `?reconnected=1&tenantId=...` query params.
 */

import { useEffect, useState } from 'react';
import type { Tenant } from '@sparkhub/sdk';
import { useSparkhub } from './SparkhubProvider.js';
import { useConnections } from './useConnections.js';

export interface TenantPanelAppearance {
  variables?: {
    colorAccent?: string;
    borderRadius?: string;
    font?: string;
  };
}

export interface TenantPanelProps {
  tenantId: string;
  /** Optional callback to override the default redirect-out behavior. */
  onConnectRequest?: (tenantId: string) => void;
  /** URL to return to after the connection ceremony. Defaults to current URL. */
  returnTo?: string;
  appearance?: TenantPanelAppearance;
  className?: string;
}

export function TenantPanel({
  tenantId,
  onConnectRequest,
  returnTo,
  appearance,
  className,
}: TenantPanelProps) {
  const { client } = useSparkhub();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantError, setTenantError] = useState<Error | null>(null);
  const [isTenantLoading, setIsTenantLoading] = useState(true);
  const { connections, isLoading: isConnLoading } = useConnections(tenantId);

  useEffect(() => {
    let cancelled = false;
    setIsTenantLoading(true);
    client.tenants
      .get(tenantId)
      .then((result) => {
        if (!cancelled) {
          setTenant(result);
          setTenantError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTenant(null);
          setTenantError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) setIsTenantLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, tenantId]);

  const styleVars: React.CSSProperties = {
    ['--sparkhub-color-accent' as string]: appearance?.variables?.colorAccent ?? '#2563eb',
    ['--sparkhub-border-radius' as string]: appearance?.variables?.borderRadius ?? '6px',
    ['--sparkhub-font' as string]:
      appearance?.variables?.font ?? 'ui-sans-serif, system-ui, sans-serif',
  };

  if (isTenantLoading) {
    return (
      <div className={className} style={styleVars} role="status">
        Loading tenant&hellip;
      </div>
    );
  }

  if (tenantError || !tenant) {
    return (
      <div className={className} style={styleVars} role="alert">
        {tenantError?.message ?? 'Tenant not found'}
      </div>
    );
  }

  const handleConnect = () => {
    if (onConnectRequest) {
      onConnectRequest(tenantId);
      return;
    }
    client.tenants.startConnectRedirect(tenantId, {
      returnTo: returnTo ?? window.location.href,
    });
  };

  const active = connections.find((c) => c.state === 'connected');
  const needsConnection = !active;

  return (
    <section
      className={className}
      style={{ ...styleVars, fontFamily: 'var(--sparkhub-font)' }}
    >
      <header>
        <h2 style={{ margin: 0 }}>{tenant.name}</h2>
        <p style={{ margin: '0.25rem 0', opacity: 0.75 }}>
          {tenant.type} &middot; {tenant.host}
        </p>
        {tenant.description && <p>{tenant.description}</p>}
      </header>

      <h3 style={{ fontSize: '0.85em', textTransform: 'uppercase', opacity: 0.6 }}>Connection</h3>
      {isConnLoading ? (
        <p>Loading connection&hellip;</p>
      ) : active ? (
        <p>
          <strong>Connected</strong>
          {active.lastConnectedAt && ` — last verified ${new Date(active.lastConnectedAt).toLocaleString()}`}
        </p>
      ) : (
        <p>Not connected.</p>
      )}

      <button
        type="button"
        onClick={handleConnect}
        style={{
          background: 'var(--sparkhub-color-accent)',
          color: 'white',
          border: 'none',
          borderRadius: 'var(--sparkhub-border-radius)',
          padding: '0.5rem 1rem',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        {needsConnection ? 'Connect to Workday' : 'Reconnect'}
      </button>
    </section>
  );
}
