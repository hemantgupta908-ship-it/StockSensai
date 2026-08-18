/**
 * Where the Android build gets its data.
 *
 * The web app talks to its own API routes, which run on a server. Inside a
 * WebView there is no server, so the same calls are served one of two ways:
 *
 *   remote  A deployed instance, when one is configured. Live prices, live
 *           Supabase, the recommendations the cron already computed.
 *   device  The seeded mock provider and the strategy engine, run in the
 *           WebView itself. No network, no keys, every screen functional.
 *
 * Remote is preferred when configured and *falls back* to device on any
 * failure, so losing signal on a train degrades the feed to demo data rather
 * than to an error screen. With nothing configured the app is device-only,
 * which is the zero-configuration state the web app already promises.
 */

/** True in the static export bundled into the APK. */
export const IS_MOBILE = process.env.NEXT_PUBLIC_MOBILE === "1";

/**
 * Build-time API base, e.g. `https://wealthsensei.vercel.app`.
 *
 * Empty means device-only. Trailing slashes are trimmed so callers can always
 * concatenate a leading-slash path.
 */
const BUILD_TIME_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

/**
 * Runtime override, set from the settings screen.
 *
 * A shipped APK cannot be rebuilt to point at a different deployment, and
 * asking someone to sideload a new build to change one URL is not a setting.
 */
const OVERRIDE_KEY = "wealthsensei:api-base";

export function getApiBase(): string {
  if (typeof window !== "undefined") {
    try {
      const override = window.localStorage.getItem(OVERRIDE_KEY);
      if (override !== null) return override.replace(/\/+$/, "");
    } catch {
      // Storage disabled — fall through to the build-time value.
    }
  }
  return BUILD_TIME_BASE;
}

export function setApiBase(base: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (base === null) window.localStorage.removeItem(OVERRIDE_KEY);
    else window.localStorage.setItem(OVERRIDE_KEY, base.replace(/\/+$/, ""));
  } catch {
    // Nothing to do — the build-time value stays in effect.
  }
}

/** Whether calls should be attempted against a remote deployment at all. */
export function hasRemote(): boolean {
  return getApiBase().startsWith("http");
}
