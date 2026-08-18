import "server-only";

import { cookies, headers } from "next/headers";

import { IS_MOBILE } from "@/lib/mobile/config";
import { parseRiskTolerance, RISK_COOKIE } from "@/lib/preferences";
import type { RiskTolerance } from "@/lib/strategies/types";

/**
 * Request-scoped reads, behind one module.
 *
 * These are the only two things the root layout needs from the incoming
 * request, and they are the only two that cannot exist in a static export:
 * `cookies()` and `headers()` opt a route out of static generation the moment
 * they are called, and `output: "export"` has no dynamic mode to fall back to.
 *
 * Isolating them here means the Android build guards two functions rather than
 * forking the root layout. `IS_MOBILE` comes from `NEXT_PUBLIC_MOBILE`, which
 * Next inlines at build time, so in the APK the calls below are unreachable
 * code rather than a runtime branch that might fire.
 */

/**
 * Risk tolerance as the server sees it.
 *
 * Mirrored into a cookie by `PreferencesProvider` precisely so SSR can read it —
 * localStorage alone would force every screen that tunes thresholds by it to
 * become client-rendered.
 */
export async function getInitialRiskTolerance(): Promise<RiskTolerance> {
  // Nothing is lost in the APK, only deferred: `PreferencesProvider` reads the
  // real value out of localStorage on mount and overrides this default before
  // anything renders numbers that depend on it.
  if (IS_MOBILE) return "moderate";

  const cookieStore = await cookies();
  return parseRiskTolerance(cookieStore.get(RISK_COOKIE)?.value);
}

/**
 * The CSP nonce set by the middleware.
 *
 * Undefined on any path the middleware does not match, where there is no policy
 * to satisfy.
 */
export async function getCspNonce(): Promise<string | undefined> {
  // The nonce belongs to a Content-Security-Policy the middleware sets on a
  // response. A file loaded out of the APK never had one.
  if (IS_MOBILE) return undefined;

  return (await headers()).get("x-nonce") ?? undefined;
}
