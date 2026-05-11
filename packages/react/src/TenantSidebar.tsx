/**
 * `<TenantSidebar>` — drop-in vertical list of the user's tenants.
 *
 * Auto-fetches via `useTenants()`. Visual states per tenant: active /
 * inactive / disabled. Highlights the `activeTenantId` row.
 *
 * Minimal theming via `appearance` — partners override `className` on the
 * outer element or restyle via CSS for everything else.
 */

import type { Tenant } from '@sparkhub/sdk';
import { useTenants } from './useTenants.js';

export interface TenantSidebarAppearance {
  variables?: {
    colorAccent?: string;
    borderRadius?: string;
    font?: string;
  };
}

export interface TenantSidebarProps {
  activeTenantId?: string | null;
  onTenantSelect: (tenantId: string) => void;
  /** Filter tenants by environment type. If omitted, all are shown. */
  filter?: {
    type?: string[];
  };
  appearance?: TenantSidebarAppearance;
  className?: string;
  /** Empty-state message. Default: "No tenants available." */
  emptyMessage?: string;
}

export function TenantSidebar({
  activeTenantId,
  onTenantSelect,
  filter,
  appearance,
  className,
  emptyMessage = 'No tenants available.',
}: TenantSidebarProps) {
  const { tenants, isLoading, error } = useTenants();

  const filtered = filterTenants(tenants, filter);

  const styleVars: React.CSSProperties = {
    ['--sparkhub-color-accent' as string]: appearance?.variables?.colorAccent ?? '#2563eb',
    ['--sparkhub-border-radius' as string]: appearance?.variables?.borderRadius ?? '6px',
    ['--sparkhub-font' as string]:
      appearance?.variables?.font ?? 'ui-sans-serif, system-ui, sans-serif',
  };

  if (isLoading) {
    return (
      <div className={className} style={styleVars} role="status">
        Loading tenants&hellip;
      </div>
    );
  }

  if (error) {
    return (
      <div className={className} style={styleVars} role="alert">
        Failed to load tenants: {error.message}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className={className} style={styleVars}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <nav
      className={className}
      style={{ ...styleVars, fontFamily: 'var(--sparkhub-font)' }}
      aria-label="Tenants"
    >
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {filtered.map((tenant) => (
          <TenantSidebarItem
            key={tenant.id}
            tenant={tenant}
            isActive={tenant.id === activeTenantId}
            onSelect={() => onTenantSelect(tenant.id)}
          />
        ))}
      </ul>
    </nav>
  );
}

interface TenantSidebarItemProps {
  tenant: Tenant;
  isActive: boolean;
  onSelect: () => void;
}

function TenantSidebarItem({ tenant, isActive, onSelect }: TenantSidebarItemProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive ? 'true' : undefined}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          padding: '0.5rem 0.75rem',
          background: isActive ? 'var(--sparkhub-color-accent)' : 'transparent',
          color: isActive ? 'white' : 'inherit',
          border: 'none',
          borderRadius: 'var(--sparkhub-border-radius)',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        <div style={{ fontWeight: isActive ? 600 : 500 }}>{tenant.name}</div>
        <div style={{ fontSize: '0.8em', opacity: 0.75 }}>
          {tenant.type} &middot; {tenant.host}
        </div>
      </button>
    </li>
  );
}

function filterTenants(tenants: Tenant[], filter?: TenantSidebarProps['filter']): Tenant[] {
  if (!filter) return tenants;
  return tenants.filter((t) => {
    if (filter.type && filter.type.length > 0 && !filter.type.includes(t.type)) return false;
    return true;
  });
}
