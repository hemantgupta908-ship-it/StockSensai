"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { authCookieMaxAge, readRememberCookie } from "@/lib/auth/remember";
import type { Database } from "./types";

let client: SupabaseClient<Database> | null = null;

/**
 * Browser Supabase client, or null when the project isn't configured.
 *
 * Returning null rather than throwing is deliberate: the app is designed to run
 * end-to-end with no backend at all (watchlist and journal fall back to browser
 * storage), so that `npm run dev` works before anyone has created a Supabase
 * project. Every call site must handle the null.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) return null;

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
