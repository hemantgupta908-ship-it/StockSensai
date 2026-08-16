/**
 * Response hardening.
 *
 * These are the headers a money-adjacent app is expected to send and this one
 * was sending none of. The Content-Security-Policy is built per request because
 * two parts of it are only knowable at runtime: the Supabase origin, which is
 * environment configuration, and the nonce, which must be unique per response.
 */

import { isDriveStorageEnabled, sentryDsn, supabaseUrl } from "@/lib/env";

/**
 * Whether the CSP is enforced or merely reported.
 *
 * Report-Only is the deliberate starting point. A policy that is subtly too
 * strict does not degrade — it blanks the page — and the only honest way to
 * learn what a real session loads is to watch a real session. Violations arrive
 * in the browser console (and at `report-uri`, if one is ever configured)
 * without anything breaking.
 *
 * Flip to `false` once the console stays quiet through a full pass: sign in,
 * both environments, a chart, an import, a theme toggle.
 */
export const CSP_REPORT_ONLY = true;

/** The Supabase origin, if one is configured — REST and realtime both need it. */
function supabaseOrigins(): string[] {
  if (!supabaseUrl.startsWith("http")) return [];
  try {
    const { origin, host } = new URL(supabaseUrl);
    // Realtime subscriptions open a websocket against the same host.
    return [origin, `wss://${host}`];
  } catch {
    return [];
  }
}

/**
 * The Sentry ingest origin, if error reporting is configured.
 *
 * Without this the reporter is blocked by the very policy it exists to help
 * debug — and blocked silently, since a CSP violation is not something the SDK
 * can report to a server it cannot reach.
 */
function sentryOrigin(): string[] {
  if (!sentryDsn.startsWith("http")) return [];
  try {
    return [new URL(sentryDsn).origin];
  } catch {
    return [];
  }
}

/**
 * Google's origins, when a Google account's data is kept in its own Drive.
 *
 * `accounts.google.com` issues the access tokens and `www.googleapis.com` is
 * the Drive API itself. Both are added only when the feature is configured —
 * a deployment without it keeps the tighter policy rather than carrying holes
 * for a capability it does not use.
 *
 * Note there is no entry for `script-src`. Identity Services is injected by
 * our own code, and under `strict-dynamic` that inherits trust; a host listed
 * there would be ignored by every browser that understands the directive.
 */
function googleOrigins(): string[] {
  if (!isDriveStorageEnabled) return [];
  return ["https://accounts.google.com", "https://www.googleapis.com"];
}

/**
 * Build the policy for one response.
 *
 * `strict-dynamic` is what makes a nonce workable in the App Router: Next emits
 * a nonced bootstrap script that then injects the route's own chunks, and
 * without it every one of those injected chunks would need its own nonce.
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const connect = ["'self'", ...supabaseOrigins(), ...sentryOrigin(), ...googleOrigins()];
  // The dev server pushes HMR updates over a websocket on the same origin.
  if (isDev) connect.push("ws:", "wss:");

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // React's dev build and the Next dev overlay both eval.
    ...(isDev ? ["'unsafe-eval'"] : []),
  ];

  const directives: Record<string, string[] | null> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    // Tailwind ships a stylesheet, but framer-motion animates through inline
    // `style` attributes, which this also governs. There is no nonce mechanism
    // for style attributes, so this stays permissive; the risk it carries is
    // styling, not execution.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": connect,
    // The spreadsheet template is handed over as a blob URL.
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    // The modern equivalent of X-Frame-Options: nothing may frame this app.
    "frame-ancestors": ["'none'"],
    /**
     * Google Identity Services renews an access token through a hidden iframe
     * on `accounts.google.com` — that is what makes the renewal silent. Under
     * `frame-src 'none'` the frame is blocked, the renewal times out, and a
     * Google user's sync stops an hour into the session with nothing in the UI
     * to explain it.
     */
    "frame-src": isDriveStorageEnabled ? ["https://accounts.google.com"] : ["'none'"],
    // Valueless directive. Omitted in dev, where the origin is plain http, and
    // under Report-Only, where the browser ignores it and says so on every load.
    "upgrade-insecure-requests": isDev || CSP_REPORT_ONLY ? null : [],
  };

  return Object.entries(directives)
    .filter(([, value]) => value !== null)
    .map(([name, value]) => (value!.length > 0 ? `${name} ${value!.join(" ")}` : name))
    .join("; ");
}

/**
 * Apply the security headers to a response.
 *
 * Called on every exit from the middleware — including the redirects and the
 * 401 — because a header that only covers the happy path covers nothing.
 */
export function applySecurityHeaders(
  headers: Headers,
  { csp, isDev }: { csp: string; isDev: boolean },
): void {
  headers.set(
    CSP_REPORT_ONLY ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
    csp,
  );

  // Belt and braces alongside frame-ancestors, for anything that predates CSP.
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  // Send the origin cross-site but never the path — screens here carry tickers
  // and account identifiers in the URL.
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Nothing in this app uses any of these.
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=()",
  );
  headers.set("X-DNS-Prefetch-Control", "off");

  // Only meaningful over TLS, and actively unhelpful against a local http dev
  // server, where it would pin localhost to https in the browser for a year.
  if (!isDev) {
    headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
}
