# Minimal React example — placeholder

This folder is reserved for a React + Vite example showing how to wrap
`@sparkhub/sdk` in a React hook.

It's not implemented in M1.2 — vanilla-html demo is enough for the v0
release. The React hook pattern is straightforward:

```tsx
// useSparkhub.ts
import { useEffect, useState, useMemo } from 'react';
import { createSparkhubClient, type SparkhubClient, type PartnerAppMe } from '@sparkhub/sdk';

const config = {
  clientId: import.meta.env.VITE_SPARKHUB_CLIENT_ID,
  scopes: ['partner-app:read'],
  redirectUri: window.location.origin + '/auth/callback',
};

let singleton: SparkhubClient | null = null;
function getClient(): SparkhubClient {
  if (!singleton) singleton = createSparkhubClient(config);
  return singleton;
}

export function useSparkhub() {
  const client = useMemo(getClient, []);
  const [me, setMe] = useState<PartnerAppMe | null>(null);
  const [authed, setAuthed] = useState<boolean>(client.isAuthenticated());

  useEffect(() => {
    if (!authed) return;
    client.me().then(setMe).catch(() => setMe(null));
  }, [authed, client]);

  return {
    client,
    isAuthenticated: authed,
    me,
    login: () => client.authorize(),
    logout: () => client.logout().then(() => setAuthed(false)),
  };
}
```

Add a callback route at `/auth/callback` that calls `client.handleCallback()`
on mount, then redirects back to your app's protected area.
