/**
 * Where a signed-in user belongs, and how to safely honour a requested path.
 *
 * Both halves were previously written out at each call site — the sign-in page,
 * the OAuth/email callback, and the form's own default — which is how they
 * drifted: the app's home moved to `/budget` (root redirects there, and so does
 * the middleware when a signed-in user hits `/login`) while sign-in kept
 * landing people on `/home`, the recommendations feed.
 */

/**
 * The app's home.
 *
 * Note `/home` is *not* this. It is the screened-ideas feed, and the sidebar
 * labels it "Stock Recommendations" — an old name that outlived the route it
 * belongs to. `/budget` is what the sidebar calls "Home".
 */
export const DEFAULT_SIGNED_IN_PATH = "/budget";

/**
 * Resolve a `next` parameter to a path inside this app.
 *
 * Anything else is discarded rather than sanitised. `new URL("https://evil.com",
 * origin)` resolves to the absolute URL and `//evil.com` to a protocol-relative
 * one, so an unchecked value hands an attacker a redirect that fires the instant
 * the session cookie is set.
 */
export function resolveNext(requested: string | null | undefined): string {
  if (!requested) return DEFAULT_SIGNED_IN_PATH;
  if (!requested.startsWith("/") || requested.startsWith("//")) return DEFAULT_SIGNED_IN_PATH;
  return requested;
}
