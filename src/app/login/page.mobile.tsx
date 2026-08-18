"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/env";
import { resolveNext } from "@/lib/auth/destination";
import { CALLBACK_ERRORS, LoginScreen } from "@/components/auth/login-screen";
import { SessionProvider, useSession } from "@/components/auth/session-provider";

/**
 * The sign-in screen, as bundled into the APK.
 *
 * Two things the web page does on the server have to move to the client here.
 * The `next` and `error` query parameters are read with `useSearchParams`,
 * because a static export is rendered once at build time with no request to
 * take them from. And the "already signed in" redirect reads the browser
 * client's session rather than a cookie, which is the only place a session
 * exists inside a WebView.
 *
 * This route sits outside `AppShell`, so it mounts its own `SessionProvider` —
 * without one, `useSession` would report a permanently signed-out state and
 * someone reopening the app would be held on this screen with a valid session.
 */
export default function LoginPage() {
  return (
    <SessionProvider>
      <Suspense fallback={null}>
        <MobileLogin />
      </Suspense>
    </SessionProvider>
  );
}

function MobileLogin() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading } = useSession();

  const destination = resolveNext(searchParams.get("next"));
  const callbackError = searchParams.get("error");

  useEffect(() => {
    // `loading` stays true until the stored session has been resolved;
    // redirecting before then would bounce a signed-in user back to the form.
    if (!loading && user) router.replace(destination);
  }, [loading, user, destination, router]);

  return (
    <LoginScreen
      configured={isSupabaseConfigured}
      next={destination}
      initialError={(callbackError && CALLBACK_ERRORS[callbackError]) || null}
    />
  );
}
