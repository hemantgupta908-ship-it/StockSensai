/**
 * Merging two copies of the budget database.
 *
 * The store is mirrored to Supabase as one JSON document per user (see the
 * comment on `budget_store` in `supabase/schema.sql` for why it is not
 * normalised). A single document has an obvious failure mode: two devices that
 * both write it blindly means the slower writer silently erases the faster
 * one's work. There is no error, no conflict, no trace — the transaction is
 * just gone.
 *
 * The fix is not a lock. It is that a document written from two places has to
 * be *merged* rather than replaced, and the ported Cashew model already carries
 * everything that needs:
 *
 * - every row has a stable primary key, so the same entity is recognisable in
 *   both copies;
 * - every row has `dateTimeModified`, so the later edit of a row is knowable;
 * - deletions are tombstones in `deleteLogs`, not absences, so "deleted there"
 *   is distinguishable from "not yet synced from here". This is the reason
 *   Cashew's delete-log model was reproduced faithfully in the first place.
 *
 * So the merge is per-row last-writer-wins with tombstones applied afterwards,
 * which is the same shape Cashew itself syncs with.
 */

import {
  DeleteLogType,
  type BudgetDatabase,
  type DeleteLog,
} from "@/lib/budget/types";

/**
 * How each table is keyed, and which delete-log type retires its rows.
 *
 * `DeleteLogType`'s numbering is load-bearing — it is persisted in exported
 * files — so this maps to the enum members rather than restating the indices.
 */
const TABLES = {
  wallets: { pk: "walletPk", deleteType: DeleteLogType.TransactionWallet },
  transactions: { pk: "transactionPk", deleteType: DeleteLogType.Transaction },
  categories: { pk: "categoryPk", deleteType: DeleteLogType.TransactionCategory },
  categoryBudgetLimits: {
    pk: "categoryLimitPk",
    deleteType: DeleteLogType.CategoryBudgetLimit,
  },
  associatedTitles: {
    pk: "associatedTitlePk",
    deleteType: DeleteLogType.TransactionAssociatedTitle,
  },
  budgets: { pk: "budgetPk", deleteType: DeleteLogType.Budget },
  objectives: { pk: "objectivePk", deleteType: DeleteLogType.Objective },
  scannerTemplates: {
    pk: "scannerTemplatePk",
    deleteType: DeleteLogType.ScannerTemplate,
  },
  policies: { pk: "policyPk", deleteType: DeleteLogType.Policy },
} as const satisfies Record<
  Exclude<keyof BudgetDatabase, "deleteLogs">,
  { pk: string; deleteType: DeleteLogType }
>;

type DataTable = keyof typeof TABLES;

/** A row as this module needs to see it: a keyed thing with a modified stamp. */
type Row = Record<string, unknown> & { dateTimeModified: string | null };

/**
 * Ordering stamp for a row.
 *
 * `null` means "never modified since creation", which is what the seeded
 * defaults carry. Treating it as the beginning of time is deliberate: it makes
 * a freshly seeded device lose every contest against real edits, so signing in
 * on a new phone merges *into* the existing data instead of resurrecting twelve
 * default categories over the top of it.
 */
function stamp(row: Row): number {
  if (!row.dateTimeModified) return 0;
  const t = Date.parse(row.dateTimeModified);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Union two copies of one table, keeping the later edit of any shared row.
 *
 * Ties go to `mine`. A tie means both copies claim the same modification
 * instant, so neither is newer and the choice is arbitrary — but it has to be
 * *deterministic*, or a merge run twice over the same inputs could produce
 * different documents.
 */
function mergeTable(table: DataTable, mine: Row[], theirs: Row[]): Row[] {
  const { pk } = TABLES[table];
  const byKey = new Map<string, Row>();

  for (const row of mine) byKey.set(String(row[pk]), row);

  for (const row of theirs) {
    const key = String(row[pk]);
    const existing = byKey.get(key);
    if (!existing || stamp(row) > stamp(existing)) byKey.set(key, row);
  }

  return Array.from(byKey.values());
}

/** Union both tombstone sets, keyed by the delete log's own primary key. */
function mergeDeleteLogs(mine: DeleteLog[], theirs: DeleteLog[]): DeleteLog[] {
  const byKey = new Map<string, DeleteLog>();
  for (const log of mine) byKey.set(log.deleteLogPk, log);
  for (const log of theirs) if (!byKey.has(log.deleteLogPk)) byKey.set(log.deleteLogPk, log);
  return Array.from(byKey.values());
}

/**
 * Drop rows that a tombstone retires.
 *
 * A row survives its own tombstone when it was modified *after* the delete was
 * recorded. That is not a quirk — it is the case where one device deleted a
 * transaction and another later edited it, and the edit is the more recent
 * statement of intent. Without this rule, an old tombstone would keep re-killing
 * a row the user has since deliberately brought back.
 */
function applyTombstones(table: DataTable, rows: Row[], logs: DeleteLog[]): Row[] {
  const { pk, deleteType } = TABLES[table];

  /** Latest tombstone per entry — an entry can be deleted more than once. */
  const deletedAt = new Map<string, number>();
  for (const log of logs) {
    if (log.type !== deleteType) continue;
    const at = Date.parse(log.dateTimeModified);
    if (Number.isNaN(at)) continue;
    const prior = deletedAt.get(log.entryPk);
    if (prior === undefined || at > prior) deletedAt.set(log.entryPk, at);
  }

  if (deletedAt.size === 0) return rows;

  return rows.filter((row) => {
    const at = deletedAt.get(String(row[pk]));
    return at === undefined || stamp(row) > at;
  });
}

/**
 * Combine two copies of the database without losing either side's work.
 *
 * `mine` is the copy this device is authoritative for and wins ties; `theirs`
 * is the copy that was found on the server. The result is order-independent
 * apart from those ties, so running it on both devices converges.
 */
export function mergeDatabases(mine: BudgetDatabase, theirs: BudgetDatabase): BudgetDatabase {
  const deleteLogs = mergeDeleteLogs(mine.deleteLogs ?? [], theirs.deleteLogs ?? []);

  const merged = { deleteLogs } as BudgetDatabase;

  for (const table of Object.keys(TABLES) as DataTable[]) {
    const mineRows = (mine[table] ?? []) as unknown as Row[];
    const theirRows = (theirs[table] ?? []) as unknown as Row[];
    const unioned = mergeTable(table, mineRows, theirRows);
    // Cast back through `unknown`: `TABLES` guarantees the key/type pairing per
    // table, but that correspondence is not expressible to the checker while
    // iterating the tables generically.
    (merged[table] as unknown) = applyTombstones(table, unioned, deleteLogs);
  }

  return merged;
}
