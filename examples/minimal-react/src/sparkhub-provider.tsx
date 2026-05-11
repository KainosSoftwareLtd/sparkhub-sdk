/**
 * Reusable React wrapper for `@sparkhub/sdk`.
 *
 * Copy this file into your partner-app codebase as a starting point. The SDK
 * itself is framework-agnostic — this provider + hook lives in your app, not
 * in `@sparkhub/sdk`.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createSparkhubClient,
  type SparkhubClient,
  type SparkhubClientOptions,
  type PartnerAppMe,
} from '@sparkhub/sdk';

interface SparkhubContextValue {
  client: SparkhubClient;
  isAuthenticated: boolean;
  me: PartnerAppMe | null;
  meError: Error | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const SparkhubContext = createContext<SparkhubContextValue | null>(null);

interface SparkhubProviderProps {
  /** SDK options — same shape as `createSparkhubClient`. */
  config: SparkhubClientOptions;
  children: ReactNode;
}

export function SparkhubProvider({ config, children }: SparkhubProviderProps) {
  const [authVersion, setAuthVersion] = useState(0);
  const [me, setMe] = useState<PartnerAppMe | null>(null);
  const [meError, setMeError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Stable client instance for the provider's lifetime. We override the
  // user's onTokenRefresh so we can re-render on rotation while still
  // forwarding to their handler if supplied.
  const userOnTokenRefresh = config.onTokenRefresh;
  const client = useMemo(
    () =>
      createSparkhubClient({
        ...config,
        onTokenRefresh: (event) => {
          setAuthVersion((v) => v + 1);
          userOnTokenRefresh?.(event);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const isAuthenticated = client.isAuthenticated();

  // Initial mount — handle the OAuth callback if we landed on a redirect URL.
  const handledCallback = useRef(false);
  useEffect(() => {
    if (handledCallback.current) return;
    handledCallback.current = true;

    const params = new URLSearchParams(window.location.search);
    const hasOAuthParams = params.has('code') || params.has('error');

    (async () => {
      try {
        if (hasOAuthParams) {
          await client.handleCallback();
          setAuthVersion((v) => v + 1);
        }
      } catch (err) {
        setMeError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [client]);

  // Whenever auth state changes, re-fetch /me.
  useEffect(() => {
    if (!isAuthenticated) {
      setMe(null);
      return;
    }
    let cancelled = false;
    client
      .me()
      .then((result) => {
        if (!cancelled) {
          setMe(result);
          setMeError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMe(null);
          setMeError(err instanceof Error ? err : new Error(String(err)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, isAuthenticated, authVersion]);

  const value = useMemo<SparkhubContextValue>(
    () => ({
      client,
      isAuthenticated,
      me,
      meError,
      isLoading,
      login: () => client.authorize(),
      logout: async () => {
        await client.logout();
        setAuthVersion((v) => v + 1);
        setMe(null);
      },
      refreshMe: async () => {
        try {
          const result = await client.me();
          setMe(result);
          setMeError(null);
        } catch (err) {
          setMeError(err instanceof Error ? err : new Error(String(err)));
        }
      },
    }),
    [client, isAuthenticated, me, meError, isLoading],
  );

  return <SparkhubContext.Provider value={value}>{children}</SparkhubContext.Provider>;
}

export function useSparkhub(): SparkhubContextValue {
  const ctx = useContext(SparkhubContext);
  if (!ctx) {
    throw new Error('useSparkhub must be used inside a <SparkhubProvider>');
  }
  return ctx;
}
