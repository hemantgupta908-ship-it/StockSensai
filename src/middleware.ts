import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Paths reachable without a session.
 *
 * Everything else — both environments and the APIs behind them — requires an
 * account. The list is deliberately short: the sign-in screen itself, the
 * confirmation-link handler that creates the session, and the disclaimer, which
 * has to stay readable by anyone deciding whether to sign up at all.
 */
const PUBLIC_PATHS = ["/login", "/auth", "/disclaimer"];

/** `/api/cron` authenticates with its own shared secret, not a user session. */
const PUBLIC_API_PREFIXES = ["/api/cron", "/api/health"];

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
  if (!isSupabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
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
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    // Come back to where they were headed once they are signed in.
    if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // A signed-in user has no business on the sign-in screen.
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/home", request.url));
  }

  return response;
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
