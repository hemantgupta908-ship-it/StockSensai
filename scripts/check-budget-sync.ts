/**
 * Scenario checks for the budget document merge.
 *
 * These are the cases that used to lose data when the store was written with a
 * blind upsert. Each one asserts on the merged document, not on types.
 */

import { mergeDatabases } from "../src/lib/budget/sync";
import { DeleteLogType, type BudgetDatabase, type Transaction } from "../src/lib/budget/types";

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function empty(): BudgetDatabase {
  return {
    wallets: [],
    transactions: [],
    categories: [],
    categoryBudgetLimits: [],
    associatedTitles: [],
    budgets: [],
    objectives: [],
    scannerTemplates: [],
    policies: [],
    deleteLogs: [],
  };
}

/** Minimal transaction — only the fields the merge reads are meaningful. */
function txn(pk: string, amount: number, modified: string | null): Transaction {
  return {
    transactionPk: pk,
    name: `txn-${pk}`,
    amount,
    dateTimeModified: modified,
  } as unknown as Transaction;
}

function db(patch: Partial<BudgetDatabase>): BudgetDatabase {
  return { ...empty(), ...patch };
}

console.log("\nbudget document merge\n");

// 1. The original bug: two devices each add a transaction the other never saw.
{
  const phone = db({ transactions: [txn("a", 100, "2026-08-16T10:00:00Z")] });
  const laptop = db({ transactions: [txn("b", 250, "2026-08-16T10:01:00Z")] });
  const merged = mergeDatabases(phone, laptop);
  const pks = merged.transactions.map((t) => t.transactionPk).sort();

  check(
    "concurrent adds on two devices both survive",
    pks.join(",") === "a,b",
    `got [${pks.join(", ")}]`,
  );
}

// 2. Same row edited in both copies — the later edit is the one that stands.
{
  const stale = db({ transactions: [txn("a", 100, "2026-08-16T10:00:00Z")] });
  const fresh = db({ transactions: [txn("a", 999, "2026-08-16T12:00:00Z")] });

  check(
    "later edit of a shared row wins (stale is mine)",
    mergeDatabases(stale, fresh).transactions[0]?.amount === 999,
  );
  check(
    "later edit of a shared row wins (fresh is mine)",
    mergeDatabases(fresh, stale).transactions[0]?.amount === 999,
  );
}

// 3. A delete on one device must not be undone by the other still holding it.
{
  const mine = db({ transactions: [txn("a", 100, "2026-08-16T10:00:00Z")] });
  const theirs = db({
    deleteLogs: [
      {
        deleteLogPk: "d1",
        entryPk: "a",
        type: DeleteLogType.Transaction,
        dateTimeModified: "2026-08-16T11:00:00Z",
      },
    ],
  });

  check(
    "a deletion elsewhere retires the row here",
    mergeDatabases(mine, theirs).transactions.length === 0,
  );
}

// 4. ...but an edit made *after* that delete is a deliberate resurrection.
{
  const mine = db({ transactions: [txn("a", 100, "2026-08-16T12:00:00Z")] });
  const theirs = db({
    deleteLogs: [
      {
        deleteLogPk: "d1",
        entryPk: "a",
        type: DeleteLogType.Transaction,
        dateTimeModified: "2026-08-16T11:00:00Z",
      },
    ],
  });

  check(
    "an edit after the tombstone keeps the row",
    mergeDatabases(mine, theirs).transactions.length === 1,
  );
}

// 5. A tombstone must only retire rows in its own table. The enum's numbering
//    is persisted, so a mismapping here would delete from the wrong one.
{
  const mine = db({ transactions: [txn("a", 100, "2026-08-16T10:00:00Z")] });
  const theirs = db({
    deleteLogs: [
      {
        deleteLogPk: "d1",
        entryPk: "a",
        type: DeleteLogType.TransactionWallet,
        dateTimeModified: "2026-08-16T11:00:00Z",
      },
    ],
  });

  check(
    "a wallet tombstone does not retire a transaction of the same pk",
    mergeDatabases(mine, theirs).transactions.length === 1,
  );
}

// 6. Seeded defaults carry `dateTimeModified: null`. A fresh device signing in
//    must not overwrite real edits with them, nor resurrect deleted defaults.
{
  const freshDevice = db({ transactions: [txn("a", 0, null)] });
  const realData = db({ transactions: [txn("a", 4200, "2026-08-16T10:00:00Z")] });

  check(
    "a never-modified seed row loses to real data",
    mergeDatabases(freshDevice, realData).transactions[0]?.amount === 4200,
  );
}

// 7. Convergence: both devices running the merge must reach the same document,
//    or they push conflicting versions at each other indefinitely.
{
  const x = db({
    transactions: [txn("a", 1, "2026-08-16T10:00:00Z"), txn("b", 2, "2026-08-16T10:05:00Z")],
    deleteLogs: [
      {
        deleteLogPk: "d1",
        entryPk: "c",
        type: DeleteLogType.Transaction,
        dateTimeModified: "2026-08-16T10:02:00Z",
      },
    ],
  });
  const y = db({
    transactions: [txn("a", 7, "2026-08-16T11:00:00Z"), txn("c", 3, "2026-08-16T10:01:00Z")],
  });

  const sort = (d: BudgetDatabase) =>
    JSON.stringify(
      [...d.transactions].sort((p, q) => p.transactionPk.localeCompare(q.transactionPk)),
    );

  check(
    "merge converges from both directions",
    sort(mergeDatabases(x, y)) === sort(mergeDatabases(y, x)),
    `${sort(mergeDatabases(x, y))} vs ${sort(mergeDatabases(y, x))}`,
  );
}

// 8. Idempotence: re-merging a result against its own input changes nothing.
{
  const mine = db({ transactions: [txn("a", 1, "2026-08-16T10:00:00Z")] });
  const theirs = db({ transactions: [txn("b", 2, "2026-08-16T10:01:00Z")] });
  const once = mergeDatabases(mine, theirs);
  const twice = mergeDatabases(once, theirs);

  check("merging twice is the same as merging once", JSON.stringify(once) === JSON.stringify(twice));
}

console.log(
  failures === 0 ? "\nall scenarios passed\n" : `\n${failures} scenario(s) failed\n`,
);
process.exit(failures === 0 ? 0 : 1);
