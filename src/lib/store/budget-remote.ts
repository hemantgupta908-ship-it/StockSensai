/**
 * The budget document's remote, whichever one this account uses.
 *
 * Two primitives — read and conditional write — are all the provider needs, and
 * both backends express the same idea:
 *
 * - Supabase carries a `revision` column, and a write is conditional on it.
 * - Drive carries a per-file `version`, and a write is checked against it.
 *
 * Naming that shared thing `revision` here lets the provider keep one
 * reconciliation loop instead of two. The loop is the subtle part, and a second
 * copy of it that drifts is a data-loss bug waiting to be written.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

import type { BudgetDatabase } from "@/lib/budget/types";
import type { BudgetSettings } from "@/lib/budget/defaults";
import type { Database } from "@/lib/supabase/types";
import { DOCS, readDoc, writeDoc, type ExpectedVersion } from "@/lib/drive/app-data";
import type { StoreBackend } from "./backend";

/** What the remote holds, or `null` payload when it holds nothing yet. */
export interface BudgetSnapshot {
  payload: BudgetDatabase | null;
  settings: BudgetSettings | null;
  revision: number | null;
}

/**
 * A read that could not be completed.
 *
 * Distinct from a successful read of an empty remote, and the distinction
 * matters more than it looks: "you have nothing stored" invites uploading the
 * local copy, while "I could not reach your storage" must not, or a flaky
 * connection on a fresh device publishes seeded defaults over real data.
 */
export const UNREACHABLE = Symbol("unreachable");
export type ReadResult = BudgetSnapshot | typeof UNREACHABLE;

/** The shape stored in Drive — the same two fields Supabase keeps as columns. */
interface BudgetFile {
  payload: BudgetDatabase;
  settings: BudgetSettings;
}

export async function readBudget(
  backend: StoreBackend,
  user: User | null,
  supabase: SupabaseClient<Database> | null,
): Promise<ReadResult> {
  if (backend === "drive") {
    const doc = await readDoc<BudgetFile>(DOCS.budget);
    if (!doc) return UNREACHABLE;
    return {
      payload: doc.data?.payload ?? null,
      settings: doc.data?.settings ?? null,
      revision: doc.version,
    };
  }

  if (backend !== "supabase" || !supabase || !user) return UNREACHABLE;

  const { data, error } = await supabase
    .from("budget_store")
    .select("payload, settings, revision")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[budget] remote load failed:", error.message);
    return UNREACHABLE;
  }
  if (!data) return { payload: null, settings: null, revision: null };

  return {
    payload: (data.payload as BudgetDatabase) ?? null,
    settings: (data.settings as BudgetSettings) ?? null,
    revision: (data.revision as number | null) ?? 0,
  };
}

/**
 * A write's outcome.
 *
 * `conflict` means someone else moved first and the caller should merge and
 * retry; `null` means the remote was unreachable, which is not an error worth
 * retrying — browser storage already has the write.
 */
export type WriteResult = { revision: number | null } | "conflict" | null;

export async function writeBudget(
  backend: StoreBackend,
  user: User | null,
  supabase: SupabaseClient<Database> | null,
  payload: BudgetDatabase,
  settings: BudgetSettings,
  expectedRevision: number | null,
): Promise<WriteResult> {
  if (backend === "drive") {
    // `null` here means this device has not seen a document, so it expects to
    // be creating one — mirroring the insert path below rather than upserting.
    const expected: ExpectedVersion = expectedRevision === null ? "absent" : expectedRevision;
    const result = await writeDoc<BudgetFile>(DOCS.budget, { payload, settings }, expected);
    if (result === "conflict" || result === null) return result;
    return { revision: result.version };
  }

  if (backend !== "supabase" || !supabase || !user) return null;

  const row = {
    user_id: user.id,
    payload,
    settings,
    updated_at: new Date().toISOString(),
  };

  if (expectedRevision === null) {
    // Insert rather than upsert, so losing the race to create the row surfaces
    // as a duplicate-key failure and reconciles instead of flattening whatever
    // the winner wrote.
    const { data, error } = await supabase
      .from("budget_store")
      .insert({ ...row, revision: 1 })
      .select("revision")
      .maybeSingle();

    if (!error && data) return { revision: data.revision as number };
    return "conflict";
  }

  const { data, error } = await supabase
    .from("budget_store")
    .update({ ...row, revision: expectedRevision + 1 })
    .eq("user_id", user.id)
    .eq("revision", expectedRevision)
    .select("revision")
    .maybeSingle();

  if (error) {
    // Transport or policy failure, not a conflict. Retrying would not help and
    // browser storage already holds the write.
    console.warn("[budget] remote persist failed:", error.message);
    return null;
  }
  // Matched no row: another device has written since this one last read.
  return data ? { revision: data.revision as number } : "conflict";
}
