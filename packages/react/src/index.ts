/**
 * `@sparkhub/react` — React bindings for `@sparkhub/sdk`.
 *
 * Provider + hooks for partner apps, plus drop-in tenant components.
 */

// Provider + main hook
export { SparkhubProvider, useSparkhub } from './SparkhubProvider.js';

// Tenant hooks
export { useTenants } from './useTenants.js';
export { useConnections } from './useConnections.js';
export { ActiveTenantProvider, useActiveTenant } from './useActiveTenant.js';

// Tenant components
export { TenantSidebar } from './TenantSidebar.js';

// Re-export types for convenience
export type {
  Tenant,
  Connection,
  PartnerAppMe,
  SparkhubClientOptions,
  SparkhubError,
  TokenRefreshEvent,
  TokenRefreshReason,
} from '@sparkhub/sdk';

export type { UseTenantsResult } from './useTenants.js';
export type { UseConnectionsResult } from './useConnections.js';
export type { ActiveTenantProviderProps } from './useActiveTenant.js';
export type {
  TenantSidebarProps,
  TenantSidebarAppearance,
} from './TenantSidebar.js';
