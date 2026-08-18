"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { DEFAULT_SIGNED_IN_PATH, resolveNext } from "@/lib/auth/destination";

/**
 * The sign-in callback, for the build with no server.
 *
 * Three flows land here: the signup confirmation email, the password-reset
 * email, and the return leg of Google OAuth. On the web a route handler
 * exchanges the code for a session — but a route handler needs a server, so in
 * the APK this route did not exist at all. Google sign-in left the app,
 * authenticated, came back through the `com.wealthsensei.app://` deep link, and
 * landed on a path with no page behind it. The session was never created, which
 * looks exactly like "signing in does nothing".
 *
 * The browser client performs the identical exchange. It is also the *right*
 * client here: it stores the session where the rest of the WebView can see it,
 * whereas the server flow writes a cookie on a different origin entirely.
 */
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackStatus />}>
      <AuthCallback />
    </Suspense>
  );
}

function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** The exchange must not run twice — the second call fails on a spent code. */
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const next = resolveNext(searchParams.get("next"));

    /** Back to the sign-in screen with a reason, keeping the destination. */
    const bounce = (reason: string) => {
      const params = new URLSearchParams({ error: reason });
      if (next !== DEFAULT_SIGNED_IN_PATH) params.set("next", next);
      router.replace(`/login?${params}`);
    };

    void (async () => {
      // The provider can refuse before any code is issued — most often because
      // the user hit "Cancel" on Google's consent screen, which is not an error
      // worth shouting about.
      const providerError = searchParams.get("error");
      if (providerError) {
        bounce(providerError === "access_denied" ? "cancelled" : "provider");
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        bounce("auth");
        return;
      }

      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("[auth/callback] code exchange failed:", error.message);
          bounce("auth");
          return;
        }
        router.replace(next);
        return;
      }

      // Implicit flow puts the tokens in the fragment instead of a query code.
      // `detectSessionInUrl` on the browser client consumes those on load, so
      // by the time this runs the session may already exist — check before
      // treating a missing `code` as a failure.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace(next);
        return;
      }

      bounce("auth");
    })();
  }, [router, searchParams]);

  return <CallbackStatus />;
}

function CallbackStatus() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-fill/20 border-t-brand" />
      <p className="text-subhead text-label-secondary/70">Signing you in…</p>
    </main>
  );
}
