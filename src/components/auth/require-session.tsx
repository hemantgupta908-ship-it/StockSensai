"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { IS_MOBILE } from "@/lib/mobile/config";
import { useSession } from "./session-provider";
import { useAppPathname } from "@/lib/use-app-pathname";

/**
 * The signed-out gate, for the build that has no middleware.
 *
 * On the web, `middleware.ts` turns away a request without a session before a
 * page renders, and `requireUser()` in each layout is the second lock. Neither
 * exists in a static export: middleware needs a server to run on, and the
 * layouts' `requireUser()` is aliased to null in the APK because a Supabase
 * session cookie set on a deployment's origin is not readable from
 * `https://localhost` anyway.
 *
 * So the gate moves to where the session actually lives — the browser client,
 * which holds it in local storage and is the only thing in the WebView that can
 * see it.
 *
 * Renders nothing and does nothing on the web, where the two server-side locks
 * are already in force and a client-side redirect would only add a flash.
 */
export function RequireSession() {
  const { user, loading, authEnabled } = useSession();
  const router = useRouter();
  const pathname = useAppPathname();

  useEffect(() => {
    if (!IS_MOBILE) return;
    // No Supabase project means no account to require and no way to create one.
    // Gating here would turn a working demo into a locked door — the same
    // reasoning the middleware applies on the web.
    if (!authEnabled) return;
    // `loading` is true until the browser client has resolved a stored session.
    // Redirecting before then signs out anyone who reopens the app.
    if (loading || user) return;

    const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${next}`);
  }, [authEnabled, loading, user, pathname, router]);

  return null;
}
