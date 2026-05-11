import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SparkhubProvider, ActiveTenantProvider } from '@sparkhub/react';
import { App } from './App';
import './styles.css';

const clientId = import.meta.env.VITE_SPARKHUB_CLIENT_ID as string | undefined;
const sparkhubBase =
  (import.meta.env.VITE_SPARKHUB_BASE as string | undefined) ?? 'https://sparkhub.studio';
const orgHint = import.meta.env.VITE_SPARKHUB_ORG as string | undefined;
const DEFAULT_SCOPES = [
  'partner-app:read',
  'partner-app:tenants:read',
  'partner-app:tenants:execute',
  'partner-app:data:read',
  'partner-app:data:write',
].join(',');
const scopes = ((import.meta.env.VITE_SPARKHUB_SCOPES as string | undefined) ?? DEFAULT_SCOPES)
  .split(/[,\s]+/)
  .filter(Boolean);

const root = createRoot(document.getElementById('root')!);

if (!clientId) {
  root.render(
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', color: '#991b1b' }}>
      Missing <code>VITE_SPARKHUB_CLIENT_ID</code>. Copy <code>.env.example</code> to <code>.env.local</code> and set your <code>papp_*</code> client ID, then restart the dev server.
    </div>,
  );
} else {
  root.render(
    <StrictMode>
      <SparkhubProvider
        config={{
          clientId,
          scopes,
          redirectUri: window.location.origin + window.location.pathname,
          sparkhubBase,
          org: orgHint,
          onTokenRefresh: (event) => {
            console.log(`[partner-app] token refreshed (${event.reason})`);
          },
        }}
      >
        <ActiveTenantProvider persist="sessionStorage">
          <App />
        </ActiveTenantProvider>
      </SparkhubProvider>
    </StrictMode>,
  );
}
