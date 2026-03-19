import { authClient } from './auth-client';

/** Minimal user profile exposed to UI components. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

/** Simplified auth session state for UI consumption. */
export interface AuthSession {
  user: AuthUser | null;
  isPending: boolean;
}

/**
 * Call once at app startup, before any UI subscribes to auth state.
 *
 * Handles the OAuth OTT (one-time token) redirect flow:
 *  1. If `?ott=TOKEN` is present in the URL, verifies the token via the
 *     crossDomain plugin and populates the session atom.
 *  2. Otherwise, calls `getSession()` to hydrate from the stored
 *     localStorage cookie (crossDomainClient handles persistence).
 */
export async function initAuthState(): Promise<void> {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('ott');

  if (token) {
    // Clean the OTT param from the visible URL immediately
    url.searchParams.delete('ott');
    window.history.replaceState({}, '', url.toString());

    try {
      // Cast needed: crossDomain plugin types are not fully re-exported
      const result = await (authClient as any).crossDomain.oneTimeToken.verify({ token });
      const session = result?.data?.session;

      if (session) {
        // Populate the session atom by fetching with the new session token
        await authClient.getSession({
          fetchOptions: {
            headers: { Authorization: `Bearer ${session.token}` },
          },
        });
        // Trigger nanostore atom refresh (method may not exist on all versions)
        (authClient as any).updateSession?.();
      }
    } catch (err) {
      console.warn('[auth-state] OTT verification failed:', err);
    }
  } else {
    // No OTT — hydrate session from stored localStorage cookie
    try {
      await authClient.getSession();
    } catch (err) {
      console.warn('[auth-state] Session hydration failed:', err);
    }
  }
}

/**
 * Subscribe to reactive auth state changes.
 * Maps the raw nanostore atom value to the simpler {@link AuthSession} type.
 *
 * @returns Unsubscribe function — call in `destroy()` to prevent leaks.
 */
export function subscribeAuthState(callback: (state: AuthSession) => void): () => void {
  return authClient.useSession.subscribe((value) => {
    const raw = value as any;
    callback({
      user: raw.data?.user
        ? {
            id: raw.data.user.id,
            name: raw.data.user.name,
            email: raw.data.user.email,
            image: raw.data.user.image ?? null,
          }
        : null,
      isPending: raw.isPending ?? false,
    });
  });
}

/**
 * Synchronous snapshot of the current auth state.
 * Useful for one-off reads outside of reactive subscriptions.
 */
export function getAuthState(): AuthSession {
  const raw = authClient.useSession.get() as any;
  return {
    user: raw.data?.user
      ? {
          id: raw.data.user.id,
          name: raw.data.user.name,
          email: raw.data.user.email,
          image: raw.data.user.image ?? null,
        }
      : null,
    isPending: raw.isPending ?? false,
  };
}
