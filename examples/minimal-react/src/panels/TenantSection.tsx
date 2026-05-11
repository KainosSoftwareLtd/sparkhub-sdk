/**
 * Tenant selection + detail panel. Wires `<TenantSidebar>` + `<TenantPanel>`
 * from `@sparkhub/react` together via the active-tenant context.
 */

import { TenantSidebar, TenantPanel, useActiveTenant } from '@sparkhub/react';

export function TenantSection() {
  const { activeTenantId, setActiveTenant } = useActiveTenant();

  return (
    <section className="card">
      <h2>Tenants</h2>
      <p className="muted">
        Tenants are managed by SparkHub. Partner apps see the list + connection
        state and trigger the (re)connect flow via a redirect to SparkHub's UI.
      </p>
      <div className="tenant-grid">
        <aside className="tenant-list">
          <TenantSidebar
            activeTenantId={activeTenantId}
            onTenantSelect={(id) => setActiveTenant(id)}
            appearance={{ variables: { colorAccent: '#2563eb', borderRadius: '6px' } }}
          />
        </aside>
        <div className="tenant-detail">
          {activeTenantId ? (
            <TenantPanel
              tenantId={activeTenantId}
              returnTo={window.location.href}
              appearance={{ variables: { colorAccent: '#2563eb' } }}
            />
          ) : (
            <p className="muted">Select a tenant from the list to view detail.</p>
          )}
        </div>
      </div>
    </section>
  );
}
