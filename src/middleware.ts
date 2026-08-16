import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { REMEMBER_COOKIE, authCookieMaxAge, isRemembered } from "@/lib/auth/remember";
import { DEFAULT_SIGNED_IN_PATH } from "@/lib/auth/destination";
import { applySecurityHeaders, buildContentSecurityPolicy } from "@/lib/security-headers";

/**
 * Paths reachable without a session.
 *
 * Everything else — both environments and the APIs behind them — requires an
 * account. The list is deliberately short: the sign-in screen itself, the
 * confirmation-link handler that creates the session, and the disclaimer, which
 * has to stay readable by anyone deciding whether to sign up at all.
 */
const PUBLIC_PATHS = [
  "/login",
  "/auth",
  "/disclaimer",
  /**
   * The web app manifest.
   *
   * Not a page, and gating it broke installation outright: the browser fetches
   * it to decide whether the app is installable, often without credentials, so
   * a redirect to the sign-in screen meant it never parsed a manifest at all.
   * It carries nothing private — the name, icons and start URL are all public
   * by construction.
   */
  "/manifest.webmanifest",
];

/**
 * `/api/cron` authenticates with its own shared secret, not a user session.
 *
 * `/monitoring` is Sentry's tunnel (see `tunnelRoute` in next.config.mjs). It
 * has to stay open: the errors most worth reporting are the ones that happen
 * before or instead of a successful sign-in, and gating it would drop exactly
 * those while appearing to work.
 */
const PUBLIC_API_PREFIXES = ["/api/cron", "/api/health", "/monitoring"];

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  );
}

/**
 * Refreshes the Supabase auth token on navigation so server components see a
 * valid session, and turns away anyone without one.
 *
 * The gate is conditional on Supabase being configured, and that is not a
 * loophole — without a project there is no way to *create* an account, so
 * enforcing it would make a fresh clone a locked door rather than a demo. Any
 * deployment that has credentials is fully gated.
 */
export async function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";

  // One nonce per response. Next picks it up from the request-side CSP header
  // and stamps it on its own bootstrap scripts; `x-nonce` is how the root
  // layout reaches it for the theme script it inlines itself.
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = buildContentSecurityPolicy(nonce, isDev);

  /**
   * Request headers to forward, carrying the nonce.
   *
   * Rebuilt at each call rather than computed once: the Supabase client mutates
   * `request.cookies` while refreshing the session, and a copy taken before that
   * would forward the pre-refresh cookie to the server components.
   */
  const forwardedHeaders = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", csp);
    return headers;
  };

  /** Every exit from this function goes through here. */
  const harden = (response: NextResponse) => {
    applySecurityHeaders(response.headers, { csp, isDev });
    return response;
  };

  if (!isSupabaseConfigured) {
    return harden(NextResponse.next({ request: { headers: forwardedHeaders() } }));
  }

  let response = NextResponse.next({ request: { headers: forwardedHeaders() } });

  // Token refresh rewrites the auth cookie on every navigation. Left alone it
  // would re-apply Supabase's 400-day default and quietly undo a user who chose
  // not to be remembered, so the choice is re-applied here too.
  const remembered = isRemembered(request.cookies.get(REMEMBER_COOKIE)?.value);
  const maxAge = authCookieMaxAge(remembered);

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: forwardedHeaders() } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, { ...options, maxAge }),
        );
      },
    },
  });

  // Touching getUser() is what actually performs the refresh. It validates the
  // token against Supabase rather than trusting the cookie, so its answer is
  // safe to gate on.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    // APIs get a status, not a redirect: a fetch that follows a 307 to the
    // sign-in page would hand the caller an HTML body where JSON was expected.
    if (pathname.startsWith("/api/")) {
      return harden(
        NextResponse.json({ error: "Authentication required" }, { status: 401 }),
      );
    }

    const loginUrl = new URL("/login", request.url);
    // Come back to where they were headed once they are signed in.
    if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
    return harden(NextResponse.redirect(loginUrl));
  }

  // A signed-in user has no business on the sign-in screen.
  if (user && pathname === "/login") {
    return harden(NextResponse.redirect(new URL(DEFAULT_SIGNED_IN_PATH, request.url)));
  }

  return harden(response);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image optimisation, which never need
     * a session and would only add latency.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
