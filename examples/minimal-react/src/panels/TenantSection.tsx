/**
 * Tenant selector — a single dropdown listing tenants the signed-in user can
 * see, with the SparkHub-supplied connection-ready state. Connection
 * management is SparkHub-side; the partner app only observes `ready`.
 */

import { useTenants, useActiveTenant } from '@sparkhub/react';

export function TenantSection() {
  const { tenants, isLoading, error } = useTenants();
  const { activeTenantId, setActiveTenant } = useActiveTenant();

  return (
    <section className="card">
      <h2>Tenant</h2>
      <p className="muted">
        Pick the Workday tenant the SOAP / RAAS / WQL panels below will run against.
        Connection state comes straight from SparkHub.
      </p>

      {error && <p className="status error">Failed to load tenants: {error.message}</p>}
      {isLoading && <p className="muted">Loading tenants&hellip;</p>}

      {!isLoading && !error && tenants.length === 0 && (
        <p className="muted">No tenants available in this organization.</p>
      )}

      {!isLoading && !error && tenants.length > 0 && (
        <div className="actions" style={{ alignItems: 'center', gap: '0.75rem' }}>
          <label htmlFor="tenant-select" style={{ fontWeight: 500 }}>
            Tenant:
          </label>
          <select
            id="tenant-select"
            value={activeTenantId ?? ''}
            onChange={(e) => setActiveTenant(e.target.value || null)}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              minWidth: 320,
            }}
          >
            <option value="">— select a tenant —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.type}) — {t.connection?.ready ? 'Ready' : 'Not connected'}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}
