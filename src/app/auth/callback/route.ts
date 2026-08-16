import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_SIGNED_IN_PATH, resolveNext } from "@/lib/auth/destination";

/**
 * Exchanges an auth code for a session, then redirects into the app.
 *
 * Three flows land here: the link in a signup confirmation email, the link in a
 * password-reset email, and the return leg of Google OAuth. They differ only in
 * where `next` points.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = resolveNext(url.searchParams.get("next"));

  /** Back to the sign-in screen with a reason, keeping the original destination. */
  const bounce = (reason: string) => {
    const login = new URL("/login", url.origin);
    login.searchParams.set("error", reason);
    if (next !== DEFAULT_SIGNED_IN_PATH) login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  };

  /**
   * The provider can refuse before any code is issued — most often because the
   * user hit "Cancel" on Google's consent screen, which is not an error worth
   * shouting about. Without this branch that lands on a blank form, since the
   * code below would simply fall through to the generic failure.
   */
  const providerError = url.searchParams.get("error");
  if (providerError) {
    if (providerError === "access_denied") return bounce("cancelled");
    console.error(
      "[auth/callback] provider error:",
      providerError,
      url.searchParams.get("error_description") ?? "",
    );
    return bounce("provider");
  }

  if (code) {
    const supabase = await getSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
      console.error("[auth/callback] code exchange failed:", error.message);
    }
  }

  return bounce("auth");
}
