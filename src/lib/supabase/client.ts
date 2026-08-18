"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { authCookieMaxAge, readRememberCookie } from "@/lib/auth/remember";
import { IS_MOBILE } from "@/lib/mobile/config";
import type { Database } from "./types";

let client: SupabaseClient<Database> | null = null;

/**
 * Browser Supabase client, or null when the project isn't configured.
 *
 * Returning null rather than throwing is deliberate: the app is designed to run
 * end-to-end with no backend at all (watchlist and journal fall back to browser
 * storage), so that `npm run dev` works before anyone has created a Supabase
 * project. Every call site must handle the null.
 *
 * The two builds persist the session differently, and the difference is not
 * cosmetic:
 *
 * - **Web** uses `createBrowserClient`, which writes the session to cookies.
 *   That is the whole point — `middleware.ts` and every server component read
 *   the session from those cookies, and a session the server cannot see would
 *   redirect a signed-in user back to the sign-in screen on every navigation.
 *
 * - **Android** uses the plain client, which persists to localStorage. There is
 *   no server behind the WebView to read a cookie, so the cookie buys nothing
 *   and costs reliability: a large JWT is split across several cookies, and
 *   Android's `CookieManager` does not guarantee they survive a process death
 *   unless they are explicitly flushed. Losing one chunk silently invalidates
 *   the whole session, which reads as "the app forgot I was signed in" — and,
 *   because the budget store falls back to `local` when there is no user, as
 *   "my data disappeared".
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) return null;

  if (IS_MOBILE) {
    client ??= createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The OAuth callback arrives as a deep link that the router replays
        // into the page, so the tokens can be sitting in the URL on load.
        detectSessionInUrl: true,
        // Matches the web client, so `exchangeCodeForSession` in the callback
        // page is the correct call on both. The implicit flow would put tokens
        // in a fragment instead and that exchange would find no code.
        flowType: "pkce",
      },
    });
    return client;
  }

  // The cookie's lifetime is fixed when the client is constructed, so this only
  // reflects the choice made on a *previous* visit. The middleware re-applies
  // the current one on every request, which is what actually enforces it.
  const remembered =
    typeof document === "undefined" ? true : readRememberCookie(document.cookie);

  client ??= createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookieOptions: { maxAge: authCookieMaxAge(remembered) },
  });
  return client;
}

export { isSupabaseConfigured };
