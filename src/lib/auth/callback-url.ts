import { IS_MOBILE } from "@/lib/mobile/config";

/**
 * Where Supabase should send the user after authenticating.
 *
 * On the web this is the deployment's own origin. In the APK it cannot be:
 * `window.location.origin` there is `https://localhost`, which is not a real
 * address Supabase could redirect a browser to, and even if it were, the
 * browser has no way to hand control back to the app.
 *
 * So the Android build uses the custom scheme registered in
 * `AndroidManifest.xml` and `strings.xml`. Android matches it to this app, the
 * OS reopens it, and `NativeShell` routes the URL into the client-side
 * callback page.
 *
 * Both forms must be listed under **Authentication → URL Configuration →
 * Redirect URLs** in the Supabase dashboard, or the provider refuses the
 * redirect and the user is stranded in a browser tab.
 */

/** Must match `custom_url_scheme` in `android/app/src/main/res/values/strings.xml`. */
export const MOBILE_URL_SCHEME = "com.wealthsensei.app";

/** The scheme prefix a deep link arrives with. */
export const MOBILE_DEEP_LINK_PREFIX = `${MOBILE_URL_SCHEME}://`;

/**
 * Build a callback URL, optionally carrying a post-sign-in destination.
 *
 * Browser-only: it reads `window.location.origin` on the web.
 */
export function authCallbackUrl(next?: string): string {
  const base = IS_MOBILE
    ? `${MOBILE_DEEP_LINK_PREFIX}auth/callback`
    : `${window.location.origin}/auth/callback`;

  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}

/**
 * Turn a deep link into an in-app path.
 *
 * The scheme is stripped textually rather than with `new URL()`, because a
 * custom scheme has no authority component and the parser guesses: for
 * `com.wealthsensei.app://auth/callback` it reports the host as `auth` and the
 * pathname as `/callback`, so routing on `pathname` would land on a route that
 * does not exist.
 *
 * Returns null for anything that is not one of this app's deep links.
 */
export function deepLinkToPath(url: string): string | null {
  if (!url.startsWith(MOBILE_DEEP_LINK_PREFIX)) return null;

  const rest = url.slice(MOBILE_DEEP_LINK_PREFIX.length).replace(/^\/+/, "");
  if (rest === "") return null;

  return `/${rest}`;
}
