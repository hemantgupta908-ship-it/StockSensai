/**
 * Which store holds a given user's data.
 *
 * The app has three, and which one applies is a property of the account rather
 * than a setting:
 *
 * - `drive`    — signed up with Google. Their data lives in their own Drive and
 *                never reaches this deployment's database.
 * - `supabase` — signed up with an email and password. Their data lives in the
 *                project's tables, under row-level security, as it always has.
 * - `local`    — no account, or no Supabase project configured at all. Browser
 *                storage only, which is what demo mode has always been.
 */

import type { User } from "@supabase/supabase-js";

import { isDriveStorageEnabled } from "@/lib/env";

export type StoreBackend = "drive" | "supabase" | "local";

/**
 * Whether this account was *created* through Google.
 *
 * `app_metadata.provider` is Supabase's record of the original sign-up
 * provider, and that is the right question to ask — not "does this account have
 * a Google identity attached". The two differ for a password user who later
 * links Google, and treating that as a switch to Drive would strand every row
 * they already have in Postgres behind a backend that cannot see it. Sign-up
 * provider never changes, so a user's storage never moves under their feet.
 */
export function isGoogleAccount(user: User | null): boolean {
  return user?.app_metadata?.provider === "google";
}

export function backendFor(user: User | null, authEnabled: boolean): StoreBackend {
  if (!authEnabled || !user) return "local";

  /**
   * A Google account never falls back to `supabase`, even when Drive storage
   * is unconfigured or unreachable — it degrades to `local` instead.
   *
   * This is the load-bearing line of the module. The guarantee being made to a
   * Google user is that their data does not enter this deployment's database,
   * and a guarantee with an "unless something went wrong" clause is not one. A
   * misconfigured deployment therefore loses these users' *sync*, which is
   * visible and recoverable; the alternative loses their privacy, silently and
   * permanently.
   */
  if (isGoogleAccount(user)) return isDriveStorageEnabled ? "drive" : "local";

  return "supabase";
}
