import { authClient } from './auth-client';

/** Minimal user profile exposed to UI components. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: 'free' | 'pro';
}

/** Simplified auth session state for UI consumption. */
export interface AuthSession {
  user: AuthUser | null;
  isPending: boolean;
}

// ---------------------------------------------------------------------------
// Role fetching from Convex userRoles table
// ---------------------------------------------------------------------------

// Derive the Convex cloud URL from the site URL (replace .convex.site -> .convex.cloud)
const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;
const CONVEX_CLOUD_URL = CONVEX_SITE_URL
  ? CONVEX_SITE_URL.replace('.convex.site', '.convex.cloud')
  : '';

/** Cached role for the current user -- avoids re-fetching on every state read. */
let cachedRole: 'free' | 'pro' = 'free';
let cachedRoleUserId: string | null = null;

/**
 * Fetch the user's role from the Convex userRoles table.
 * Falls back to "free" on any error.
 */
async function fetchUserRole(userId: string): Promise<'free' | 'pro'> {
  // Return cached value if we already fetched for this user
  if (cachedRoleUserId === userId) return cachedRole;
  if (!CONVEX_CLOUD_URL) return 'free';

  try {
    const resp = await fetch(`${CONVEX_CLOUD_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'userRoles:getUserRole',
        args: { userId },
      }),
    });
    const data = await resp.json();
    const role = data.value?.role === 'pro' ? 'pro' as const : 'free' as const;
    cachedRole = role;
    cachedRoleUserId = userId;
    return role;
  } catch {
    return 'free';
  }
}

// ---------------------------------------------------------------------------
// Helpers to map raw session data to AuthUser
// ---------------------------------------------------------------------------

function mapRawUser(rawUser: any): AuthUser {
  return {
    id: rawUser.id,
    name: rawUser.name,
    email: rawUser.email,
    image: rawUser.image ?? null,
    role: cachedRole,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Call once at app startup, before any UI subscribes to auth state.
 *
 * Handles the OAuth OTT (one-time token) redirect flow:
 *  1. If `?ott=TOKEN` is present in the URL, verifies the token via the
 *     crossDomain plugin and populates the session atom.
 *  2. Otherwise, calls `getSession()` to hydrate from the stored
 *     localStorage cookie (crossDomainClient handles persistence).
 *
 * After session hydration, fetches the user's role from the Convex
 * userRoles table and caches it for synchronous reads.
 */
export async function initAuthState(): Promise<void> {
  const url = new URL(window.location.href);
  const ottToken = url.searchParams.get('ott');

  if (ottToken) {
    // Clean the OTT param from the visible URL immediately
    url.searchParams.delete('ott');
    window.history.replaceState({}, '', url.toString());

    try {
      // Cast needed: crossDomain plugin types are not fully re-exported
      const result = await (authClient as any).crossDomain.oneTimeToken.verify({ token: ottToken });
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
    // No OTT -- hydrate session from stored localStorage cookie
    try {
      await authClient.getSession();
    } catch (err) {
      console.warn('[auth-state] Session hydration failed:', err);
    }
  }

  // After session hydration, fetch role for the authenticated user
  const raw = authClient.useSession.get() as any;
  const userId = raw.data?.user?.id;
  if (userId) {
    await fetchUserRole(userId);
  }
}

/**
 * Subscribe to reactive auth state changes.
 * Maps the raw nanostore atom value to the simpler {@link AuthSession} type.
 *
 * When the user changes (sign-in / sign-out), the role is re-fetched from
 * the Convex userRoles table asynchronously. The first callback fires with
 * the cached role; an updated callback fires after the fetch completes if
 * the role changed.
 *
 * @returns Unsubscribe function -- call in `destroy()` to prevent leaks.
 */
export function subscribeAuthState(callback: (state: AuthSession) => void): () => void {
  return authClient.useSession.subscribe((value) => {
    const raw = value as any;
    const rawUser = raw.data?.user;

    if (!rawUser) {
      // Signed out -- clear role cache
      cachedRole = 'free';
      cachedRoleUserId = null;
      callback({ user: null, isPending: raw.isPending ?? false });
      return;
    }

    // Fire immediately with cached role
    callback({
      user: mapRawUser(rawUser),
      isPending: raw.isPending ?? false,
    });

    // If this is a new user (different from cached), fetch role async
    if (rawUser.id !== cachedRoleUserId) {
      void fetchUserRole(rawUser.id).then((role) => {
        if (role !== cachedRole || rawUser.id !== cachedRoleUserId) {
          cachedRole = role;
          cachedRoleUserId = rawUser.id;
          // Re-notify subscriber with updated role
          callback({
            user: mapRawUser(rawUser),
            isPending: raw.isPending ?? false,
          });
        }
      });
    }
  });
}

/**
 * Synchronous snapshot of the current auth state.
 * Useful for one-off reads outside of reactive subscriptions.
 *
 * The role uses the last cached value (populated by initAuthState or
 * subscribeAuthState). If the role has not been fetched yet, defaults to "free".
 */
export function getAuthState(): AuthSession {
  const raw = authClient.useSession.get() as any;
  return {
    user: raw.data?.user
      ? mapRawUser(raw.data.user)
      : null,
    isPending: raw.isPending ?? false,
  };
}
