/**
 * Letting the Android app talk to a deployment.
 *
 * The APK's WebView runs on `https://localhost` (see `androidScheme` in
 * `capacitor.config.ts`). That is a different origin from the deployment, which
 * has two consequences the app cannot work around from its side:
 *
 *   1. The session cookie is cross-site and simply is not sent, so the
 *      middleware's cookie check sees an anonymous request no matter who is
 *      signed in. The app sends the same Supabase session as a bearer token
 *      instead — the identical JWT, validated the identical way.
 *   2. The browser refuses to expose the response at all without CORS headers,
 *      and the `Authorization` header makes every request preflighted.
 *
 * Both are handled here rather than in the middleware body so the allow-list
 * stays in one readable place. It is an allow-list, not `*`: these responses
 * carry account data, and reflecting an arbitrary origin would let any web page
 * the user visits read their portfolio.
 */

/**
 * Origins the Android shell can present.
 *
 * `https://localhost` is the release configuration. The other two are what the
 * Capacitor CLI serves during `--live-reload` development, and they are
 * accepted only outside production.
 */
const RELEASE_ORIGINS = ["https://localhost"];
const DEV_ORIGINS = ["http://localhost", "capacitor://localhost"];

export function isAllowedMobileOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  if (RELEASE_ORIGINS.includes(origin)) return true;
  return process.env.NODE_ENV !== "production" && DEV_ORIGINS.includes(origin);
}

/** Apply the CORS headers an allowed mobile origin needs. */
export function applyMobileCors(headers: Headers, origin: string) {
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  // The response body differs per origin; without this a shared cache could
  // hand one origin's CORS headers to another.
  headers.append("Vary", "Origin");
}

/** The bearer token on a request, or null. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}
