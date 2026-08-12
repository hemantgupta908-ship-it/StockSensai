/**
 * "Remember me" — how long the auth cookie survives.
 *
 * Supabase's browser client defaults to a 400-day persistent cookie. When the
 * user clears the checkbox we want a *session* cookie instead, which the browser
 * drops on close. That choice has to be honoured in two places or it does
 * nothing: the browser client that writes the cookie at sign-in, and the
 * middleware that rewrites it on every navigation when it refreshes the token.
 */

export const REMEMBER_COOKIE = "wealthsensei.remember";

/** Supabase's own default, and the ceiling Chrome allows. */
export const REMEMBERED_MAX_AGE = 400 * 24 * 60 * 60;

/** Remembering is the default; only an explicit "0" opts out. */
export function isRemembered(raw: string | null | undefined): boolean {
  return raw !== "0";
}

/**
 * `maxAge` for the auth cookie. `undefined` is meaningful here — omitting the
 * attribute is what makes a cookie a session cookie, so this must be spread
 * into the options rather than assigned a number unconditionally.
 */
export function authCookieMaxAge(remembered: boolean): number | undefined {
  return remembered ? REMEMBERED_MAX_AGE : undefined;
}

/** Read the flag from a raw `document.cookie` string. Browser-side only. */
export function readRememberCookie(cookieString: string): boolean {
  const match = cookieString.match(
    new RegExp(`(?:^|;\\s*)${REMEMBER_COOKIE}=([^;]*)`),
  );
  return isRemembered(match?.[1]);
}
