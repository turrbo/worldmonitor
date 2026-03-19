/**
 * Server-side session validation for the Vercel edge gateway.
 *
 * Validates bearer tokens by calling the Convex `/api/auth/get-session`
 * endpoint with an `Authorization: Bearer` header. Falls back to the `userRoles:getUserRole`
 * Convex query when the role is not present in the get-session response.
 *
 * Results are cached in-memory with a 60-second TTL to reduce repeated
 * calls to Convex for the same session token.
 *
 * This module must NOT import anything from `src/` — it runs in the
 * Vercel edge runtime, not the browser.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL ?? '';
const CONVEX_CLOUD_URL = CONVEX_SITE_URL
  ? CONVEX_SITE_URL.replace('.convex.site', '.convex.cloud')
  : '';

const CACHE_TTL_MS = 60_000; // 60 seconds
const CACHE_MAX_ENTRIES = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionResult {
  valid: boolean;
  userId?: string;
  role?: 'free' | 'pro';
}

// ---------------------------------------------------------------------------
// In-memory cache -- persists across warm invocations within the same Vercel
// edge isolate. TTL ensures staleness is bounded.
// ---------------------------------------------------------------------------

const sessionCache = new Map<string, { data: SessionResult; expiresAt: number }>();

function cacheResult(token: string, result: SessionResult): SessionResult {
  sessionCache.set(token, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });

  // Prevent unbounded cache growth — evict oldest entry when cap is exceeded
  if (sessionCache.size > CACHE_MAX_ENTRIES) {
    const oldest = sessionCache.keys().next().value;
    if (oldest !== undefined) sessionCache.delete(oldest);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a bearer token by calling the Convex get-session endpoint.
 *
 * Returns `{ valid: true, userId, role }` on success, or `{ valid: false }`
 * when the token is invalid, expired, or a network error occurs.
 *
 * Network errors are NOT cached so the next request can retry.
 */
export async function validateBearerToken(token: string): Promise<SessionResult> {
  // Check cache first
  const cached = sessionCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  // No Convex URL configured — cannot validate
  if (!CONVEX_SITE_URL) return { valid: false };

  try {
    // Call Convex get-session with the session token as a Bearer header
    const resp = await fetch(`${CONVEX_SITE_URL}/api/auth/get-session`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!resp.ok) return cacheResult(token, { valid: false });

    const data = await resp.json();
    if (!data?.user?.id) return cacheResult(token, { valid: false });

    // Determine role — prefer get-session response, fallback to userRoles query
    let role: 'free' | 'pro' = data.user.role === 'pro' ? 'pro' : 'free';

    if (!data.user.role && CONVEX_CLOUD_URL) {
      try {
        const roleResp = await fetch(`${CONVEX_CLOUD_URL}/api/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: 'userRoles:getUserRole',
            args: { userId: data.user.id },
          }),
        });
        const roleData = await roleResp.json();
        role = roleData.value?.role === 'pro' ? 'pro' : 'free';
      } catch {
        // Role fetch failed — default to free
      }
    }

    return cacheResult(token, { valid: true, userId: data.user.id as string, role });
  } catch {
    // Network error — do NOT cache so the next request can retry
    return { valid: false };
  }
}
