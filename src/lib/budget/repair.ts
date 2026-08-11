/**
 * Repairs for stored data that points at records which no longer exist.
 *
 * Kept pure and separate from the provider so it can be exercised directly:
 * these functions rewrite a user's ledger, and "the types check" is not
 * evidence that the right rows moved.
 */

import { resolvePremiumCategoryFk } from "./credit";
import type { BudgetDatabase, Transaction } from "./types";

/** Pulls the policy pk out of a `policy:<pk>` note tag. */
const POLICY_TAG = /(?:^|\s)policy:(\S+)/;

/**
 * Re-points category references that resolve to nothing.
 *
 * Premiums used to be stamped with a hardcoded `"6"` — "Bills & Fees" in the
 * default category set. Any ledger with its own categories has no such pk, so
 * every premium was filed under an id nothing could resolve and the whole lot
 * rendered as "Uncategorised". Deleting a category a policy referenced left the
 * same dangling pk behind, because a dead pk is not null and slips past `??`.
 *
 * Idempotent: once nothing dangles, this returns the database unchanged, so it
 * is safe to run on every load.
 */
export function repairDanglingCategoryRefs(db: BudgetDatabase): BudgetDatabase {
  const validPks = new Set(db.categories.map((c) => c.categoryPk));

  // An empty category table means the store has not loaded or seeded yet.
  // Repairing against it would file every transaction under nothing.
  if (validPks.size === 0) return db;

  const policyOf = (t: Transaction) => {
    const tag = POLICY_TAG.exec(t.note ?? "");
    return tag ? db.policies.find((p) => p.policyPk === tag[1]) : undefined;
  };

  const transactions = db.transactions.map((t) => {
    const categoryOk = validPks.has(t.categoryFk);
    const subOk = !t.subCategoryFk || validPks.has(t.subCategoryFk);
    if (categoryOk && subOk) return t;

    const next = { ...t };
    if (!categoryOk) {
      // A premium follows its own policy's category where that still resolves.
      const target = resolvePremiumCategoryFk(policyOf(t) ?? { categoryFk: null }, db.categories);
      if (!target) return t; // nothing sensible to point at; leave it alone
      next.categoryFk = target;
    }
    // A subcategory whose parent is gone is meaningless on its own.
    if (!subOk) next.subCategoryFk = null;
    return next;
  });

  const policies = db.policies.map((p) =>
    p.categoryFk && !validPks.has(p.categoryFk) ? { ...p, categoryFk: null } : p,
  );

  const transactionsChanged = transactions.some((t, i) => t !== db.transactions[i]);
  const policiesChanged = policies.some((p, i) => p !== db.policies[i]);

  if (!transactionsChanged && !policiesChanged) return db;
  return { ...db, transactions, policies };
}
