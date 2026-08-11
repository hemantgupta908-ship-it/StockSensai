/**
 * Folding several policies into one.
 *
 * Someone holding five LIC plans may not want five cards tracked separately —
 * just one record of what has been paid. Premiums are linked by a `policy:<pk>`
 * note tag, so merging is a re-tag of the transactions followed by dropping the
 * absorbed policies. No amount is touched, which is what keeps the combined
 * "Paid in" total equal to the sum of the parts.
 */

import type { BudgetDatabase, Transaction } from "./types";

/** Matches one specific policy's tag, so a re-tag cannot catch a neighbour. */
function tagPattern(policyPk: string): RegExp {
  // The pk is embedded literally; escape anything regex-significant in it.
  const escaped = policyPk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)policy:${escaped}(?=\\s|$)`, "g");
}

/** Rewrites a note so its policy tag points at `targetPk`. */
export function retagNote(note: string, sourcePk: string, targetPk: string): string {
  return note.replace(tagPattern(sourcePk), `$1policy:${targetPk}`);
}

export interface MergePoliciesResult {
  database: BudgetDatabase;
  /** How many transactions were moved onto the target. */
  movedTransactions: number;
  /** How many policies were absorbed and removed. */
  removedPolicies: number;
}

/**
 * Moves every premium recorded against `sourcePks` onto `targetPk`, then
 * removes the absorbed policies.
 *
 * Moved payments are renamed to the target's own `<name> premium`, matching
 * what `createPremiumTransaction` writes, so the transaction list reads as one
 * policy rather than a list of names that no longer exist. This does discard
 * which original plan each payment belonged to — the point of combining.
 *
 * The target is never removed, even if it appears in `sourcePks`. Returns the
 * database unchanged when there is nothing to do, so it is safe to call
 * speculatively.
 */
export function mergePolicies(
  db: BudgetDatabase,
  targetPk: string,
  sourcePks: string[],
  opts: { renamePayments?: boolean } = {},
): MergePoliciesResult {
  const { renamePayments = true } = opts;
  const target = db.policies.find((p) => p.policyPk === targetPk);
  const sources = [...new Set(sourcePks)].filter(
    (pk) => pk !== targetPk && db.policies.some((p) => p.policyPk === pk),
  );

  if (!target || sources.length === 0) {
    return { database: db, movedTransactions: 0, removedPolicies: 0 };
  }

  const mergedName = `${target.name} premium`.trim();

  let moved = 0;
  const transactions = db.transactions.map((t) => {
    const note = sources.reduce(
      (acc: string, pk: string) => retagNote(acc, pk, targetPk),
      t.note ?? "",
    );
    if (note === (t.note ?? "")) return t;
    moved++;
    // Only a payment that actually moved is renamed; rows already on the target
    // keep whatever they were called.
    return { ...t, note, ...(renamePayments && target.name ? { name: mergedName } : {}) } as Transaction;
  });

  const absorbed = new Set(sources);
  const policies = db.policies.filter((p) => !absorbed.has(p.policyPk));

  return {
    database: { ...db, transactions, policies },
    movedTransactions: moved,
    removedPolicies: sources.length,
  };
}
