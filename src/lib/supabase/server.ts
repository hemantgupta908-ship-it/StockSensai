import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { Database } from "./types";

/**
 * Server client bound to the request's cookies, so RLS policies see the signed-in
 * user. Null when Supabase isn't configured — see the note in `client.ts`.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient<Database> | null> {
  if (!isSupabaseConfigured) return null;
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Service-role client for trusted server work only — currently the daily
 * recompute cron writing the recommendations cache.
 *
 * This key bypasses row-level security entirely. It must never be imported into
 * anything that runs in the browser, which is what the `server-only` import at
 * the top of this module enforces at build time.
 */
export function getSupabaseAdminClient(): SupabaseClient<Database> | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl.startsWith("http") || !serviceKey) return null;

  return createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The signed-in user, or null in demo mode / when signed out. */
export async function getCurrentUser() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export { isSupabaseConfigured };
