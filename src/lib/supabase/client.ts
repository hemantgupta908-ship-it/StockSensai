"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";
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
  client ??= createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
  return client;
}

export { isSupabaseConfigured };
