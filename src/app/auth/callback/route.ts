import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Exchanges the email-confirmation code for a session, then redirects into the
 * app. Supabase sends users here from the link in their signup email.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requested = url.searchParams.get("next");

  // Only ever bounce to a path inside this app. `new URL("https://evil.com",
  // origin)` resolves to the absolute URL and `//evil.com` to a protocol-
  // relative one, so an unchecked `next` would hand an attacker a redirect that
  // fires the instant the session cookie is set. Same guard as /login.
  const next =
    requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : "/home";

  if (code) {
    const supabase = await getSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
      console.error("[auth/callback] code exchange failed:", error.message);
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}
