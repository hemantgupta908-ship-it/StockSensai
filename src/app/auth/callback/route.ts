import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Exchanges the email-confirmation code for a session, then redirects into the
 * app. Supabase sends users here from the link in their signup email.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/home";

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
