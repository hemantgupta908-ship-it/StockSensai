import "server-only";

/**
 * Per-caller rate limiting for this app's own API routes.
 *
 * Distinct from `lib/market-data/rate-limit.ts`, which paces *outbound* calls to
 * a brokerage feed. This one bounds *inbound* requests, and exists because one
 * endpoint is far more expensive than it looks: `/api/recommendations?refresh=1`
 * skips both the in-process cache and the durable Supabase copy, and screens the
 * whole universe against a rate-limited upstream under a 120-second budget.
 *
 * `getCachedFeed` already dedupes screens that are in flight for the same
 * style/tolerance, so the naive parallel hammer is covered. What is not covered
 * is a caller refreshing repeatedly over time, across the fifteen style and
 * tolerance combinations, keeping a continuous full screen running against the
 * upstream feed. That is the shape this guards.
 *
 * Deliberately in-process, matching the feed cache above it. On serverless that
 * means the limit is per instance rather than global — it bounds the damage any
 * one instance will do, which is the thing that actually costs money here, and
 * it needs no extra infrastructure. A global limit would need Redis, and that is
 * a bigger commitment than this endpoint currently justifies.
 */

interface Window {
  count: number;
  /** When the current window expires, as an epoch milliseconds value. */
  resetAt: number;
}

const windows = new Map<string, Window>();

/**
 * Drop expired entries once the map grows past this.
 *
 * Without it the map is an unbounded memory leak keyed by caller: every distinct
 * caller that ever hits the endpoint stays resident for the life of the
 * instance. Sweeping on write keeps it proportional to *active* callers with no
 * timer to leak.
 */
const SWEEP_THRESHOLD = 1000;

function sweep(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry. Zero when allowed. */
  retryAfterSeconds: number;
  /** Requests still available in the current window. */
  remaining: number;
}

/**
 * Fixed-window counter.
 *
 * A fixed window admits up to twice the limit across a boundary, which a
 * sliding window would not. That is a real imprecision and an acceptable one:
 * the goal is to stop sustained hammering, not to meter exactly, and the cost of
 * being wrong at a boundary is one extra screen.
 */
export function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();

  if (windows.size > SWEEP_THRESHOLD) sweep(now);

  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0, remaining: limit - 1 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0, remaining: limit - existing.count };
}

/**
 * A stable, non-identifying key for the calling session.
 *
 * Uses the Supabase auth cookie rather than the user id, because reading the id
 * means an `auth.getUser()` round trip on every request, and the middleware has
 * already established that a valid session exists before any of this runs. The
 * cookie is httpOnly, so a page script cannot rotate it to escape the limit.
 *
 * The value is hashed rather than stored: this map would otherwise hold live
 * session tokens in memory, which is a needless thing to own. Falls back to the
 * forwarded IP so an unauthenticated caller on a public route is still bounded.
 */
export function callerKey(request: Request): string {
  const cookieHeader = request.headers.get("cookie") ?? "";

  const authCookie = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => /^sb-.*-auth-token(\.\d+)?=/.test(c));

  const basis =
    authCookie ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";

  // FNV-1a. Not a security boundary — just a short, stable, non-reversible
  // handle so the map holds no session material.
  let hash = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** Test seam: the module-level map otherwise persists between cases. */
export function resetRateLimits(): void {
  windows.clear();
}
