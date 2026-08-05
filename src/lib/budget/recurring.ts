/**
 * The lifecycle of scheduled transactions, ported from Cashew's
 * `upcomingTransactionsFunctions.dart`.
 *
 * Cashew models a repeating transaction as a *chain*, not as a rule evaluated
 * on the fly: paying an instance both settles it and spawns the next one. The
 * `createdAnotherFutureTransaction` flag is what stops a chain from forking if
 * the same instance is paid twice.
 */

import { getNextRecurrenceDate } from "./period";
import {
  BALANCE_CORRECTION_CATEGORY_PK,
  TRANSFER_CATEGORY_PK,
  TransactionSpecialType,
  type Transaction,
} from "./types";

/** Recurring types spawn a successor when settled; `upcoming` is one-shot. */
function repeats(transaction: Transaction): boolean {
  return (
    transaction.type === TransactionSpecialType.subscription ||
    transaction.type === TransactionSpecialType.repetitive
  );
}

export interface RecurrenceOutcome {
  /** The instance as it should now be stored. */
  updated: Transaction;
  /** The next instance in the chain, if one is due. */
  created: Transaction | null;
  /** Set when the chain stopped because it ran past its end date. */
  endDateReached: boolean;
}

/**
 * Build the successor to a settled recurring transaction.
 *
 * Returns `null` when the transaction does not repeat, when it has already
 * spawned its successor, or when the next date would fall past `endDate`.
 */
export function createNextRecurrence(
  transaction: Transaction,
  newPk: () => string,
): { next: Transaction | null; endDateReached: boolean } {
  if (transaction.createdAnotherFutureTransaction === true) {
    return { next: null, endDateReached: false };
  }
  if (!repeats(transaction)) return { next: null, endDateReached: false };

  const newDate = getNextRecurrenceDate(
    new Date(transaction.dateCreated),
    transaction.reoccurrence,
    transaction.periodLength,
  );

  if (transaction.endDate !== null && new Date(transaction.endDate).getTime() < newDate.getTime()) {
    return { next: null, endDateReached: true };
  }

  const next: Transaction = {
    ...transaction,
    transactionPk: newPk(),
    dateCreated: newDate.toISOString(),
    originalDateDue: newDate.toISOString(),
    dateTimeModified: new Date().toISOString(),
    paid: false,
    skipPaid: false,
    createdAnotherFutureTransaction: false,
    // A fresh instance is not yet part of any shared/synced record.
    sharedKey: null,
    sharedOldKey: null,
    sharedStatus: null,
    sharedDateUpdated: null,
  };

  return { next, endDateReached: false };
}

/**
 * Mark a scheduled transaction paid.
 *
 * Cashew stamps `dateCreated` to now so the transaction lands on the day it was
 * actually paid rather than the day it was due — `originalDateDue` preserves
 * the schedule.
 */
export function markAsPaid(transaction: Transaction, newPk: () => string): RecurrenceOutcome {
  const paidDate = new Date();
  const { next, endDateReached } = createNextRecurrence(transaction, newPk);

  const updated: Transaction = {
    ...transaction,
    paid: true,
    skipPaid: false,
    dateCreated: paidDate.toISOString(),
    originalDateDue: transaction.originalDateDue ?? transaction.dateCreated,
    dateTimeModified: paidDate.toISOString(),
    createdAnotherFutureTransaction: next !== null ? true : transaction.createdAnotherFutureTransaction,
  };

  return { updated, created: next, endDateReached };
}

/**
 * Skip an instance: the chain advances but this occurrence never counts toward
 * any total (`skipPaid` keeps `paid` false while marking it resolved).
 */
export function markAsSkipped(transaction: Transaction, newPk: () => string): RecurrenceOutcome {
  const { next, endDateReached } = createNextRecurrence(transaction, newPk);

  const updated: Transaction = {
    ...transaction,
    skipPaid: true,
    paid: false,
    dateCreated: new Date().toISOString(),
    dateTimeModified: new Date().toISOString(),
    createdAnotherFutureTransaction: next !== null ? true : transaction.createdAnotherFutureTransaction,
  };

  return { updated, created: next, endDateReached };
}

/** Undo a payment. Does not retract an already-spawned successor. */
export function markAsNotPaid(transaction: Transaction): Transaction {
  return {
    ...transaction,
    paid: false,
    skipPaid: false,
    dateCreated: transaction.originalDateDue ?? transaction.dateCreated,
    dateTimeModified: new Date().toISOString(),
  };
}

/**
 * Settle every past-due instance of the given types, as Cashew's
 * "Automatically Pay Upcoming/Subscriptions" settings do on launch.
 *
 * Loops per transaction because paying one instance can produce another that is
 * *also* past due (an app left unopened for months), and Cashew catches every
 * missed cycle rather than only the first. The iteration cap keeps a
 * misconfigured row from spinning forever.
 */
export function autoPayDueTransactions(
  transactions: Transaction[],
  opts: {
    autoPayUpcoming: boolean;
    autoPaySubscriptions: boolean;
    newPk: () => string;
    now?: Date;
  },
): { updated: Transaction[]; created: Transaction[]; changed: boolean } {
  const now = opts.now ?? new Date();
  const updated = new Map<string, Transaction>();
  const created: Transaction[] = [];

  const shouldAutoPay = (t: Transaction) => {
    if (t.paid || t.skipPaid) return false;
    if (new Date(t.dateCreated).getTime() > now.getTime()) return false;
    if (t.type === TransactionSpecialType.upcoming) return opts.autoPayUpcoming;
    if (
      t.type === TransactionSpecialType.subscription ||
      t.type === TransactionSpecialType.repetitive
    ) {
      return opts.autoPaySubscriptions;
    }
    return false;
  };

  const queue = [...transactions];
  let guard = 0;
  while (queue.length > 0 && guard < 5000) {
    guard++;
    const t = queue.shift()!;
    if (!shouldAutoPay(t)) continue;

    const outcome = markAsPaid(t, opts.newPk);
    updated.set(outcome.updated.transactionPk, outcome.updated);
    if (outcome.created) {
      created.push(outcome.created);
      // The successor may itself already be due.
      queue.push(outcome.created);
    }
  }

  return {
    updated: [...updated.values()],
    created,
    changed: updated.size > 0 || created.length > 0,
  };
}

/**
 * The two halves of a balance transfer.
 *
 * Cashew implements a transfer as two independent "Balance Correction"
 * transactions — an outflow and an inflow — paired by `pairedTransactionFk`.
 * They sit in the reserved category so they move balances without registering
 * as income or expense. An optional fee is charged to the source account only.
 */
export function createTransferPair(args: {
  fromWalletPk: string;
  toWalletPk: string;
  amount: number;
  /** Amount landing in the destination, if the currencies differ. */
  destinationAmount?: number;
  fee?: number;
  date: Date;
  note?: string;
  title?: string;
  newPk: () => string;
}): Transaction[] {
  const outPk = args.newPk();
  const inPk = args.newPk();
  const iso = args.date.toISOString();
  const modified = new Date().toISOString();
  const amount = Math.abs(args.amount);
  const fee = Math.abs(args.fee ?? 0);

  const base = {
    note: args.note ?? "",
    categoryFk: TRANSFER_CATEGORY_PK,
    subCategoryFk: null,
    dateCreated: iso,
    dateTimeModified: modified,
    originalDateDue: null,
    periodLength: null,
    reoccurrence: null,
    endDate: null,
    upcomingTransactionNotification: null,
    type: null,
    paid: true,
    createdAnotherFutureTransaction: false,
    skipPaid: false,
    methodAdded: null,
    transactionOwnerEmail: null,
    transactionOriginalOwnerEmail: null,
    sharedKey: null,
    sharedOldKey: null,
    sharedStatus: null,
    sharedDateUpdated: null,
    sharedReferenceBudgetPk: null,
    objectiveFk: null,
    objectiveLoanFk: null,
    budgetFksExclude: null,
  } satisfies Partial<Transaction>;

  const transferOut: Transaction = {
    ...base,
    transactionPk: outPk,
    pairedTransactionFk: inPk,
    name: args.title || "Transfer out",
    amount: -(amount + fee),
    walletFk: args.fromWalletPk,
    income: false,
  };

  const transferIn: Transaction = {
    ...base,
    transactionPk: inPk,
    pairedTransactionFk: outPk,
    name: args.title || "Transfer in",
    amount: args.destinationAmount !== undefined ? Math.abs(args.destinationAmount) : amount,
    walletFk: args.toWalletPk,
    income: true,
  };

  return [transferOut, transferIn];
}

/**
 * A "balance correction": one transaction that moves an account to a stated
 * balance. Also in the reserved category, so it never reads as income/expense.
 */
export function createBalanceCorrection(args: {
  walletPk: string;
  currentBalance: number;
  newBalance: number;
  date: Date;
  newPk: () => string;
}): Transaction {
  const delta = args.newBalance - args.currentBalance;
  return {
    transactionPk: args.newPk(),
    pairedTransactionFk: null,
    name: "Balance correction",
    amount: delta,
    note: "",
    categoryFk: BALANCE_CORRECTION_CATEGORY_PK,
    subCategoryFk: null,
    walletFk: args.walletPk,
    dateCreated: args.date.toISOString(),
    dateTimeModified: new Date().toISOString(),
    originalDateDue: null,
    income: delta >= 0,
    periodLength: null,
    reoccurrence: null,
    endDate: null,
    upcomingTransactionNotification: null,
    type: null,
    paid: true,
    createdAnotherFutureTransaction: false,
    skipPaid: false,
    methodAdded: null,
    transactionOwnerEmail: null,
    transactionOriginalOwnerEmail: null,
    sharedKey: null,
    sharedOldKey: null,
    sharedStatus: null,
    sharedDateUpdated: null,
    sharedReferenceBudgetPk: null,
    objectiveFk: null,
    objectiveLoanFk: null,
    budgetFksExclude: null,
  };
}

/**
 * Split a long-term loan into equal instalments, as Cashew's "Generate Loan
 * Transactions" does.
 *
 * The final instalment absorbs the rounding remainder so the parts sum exactly
 * to the total.
 */
export function generateInstallments(args: {
  total: number;
  count: number;
  startDate: Date;
  reoccurrence: Transaction["reoccurrence"];
  periodLength: number;
  walletPk: string;
  categoryFk: string;
  objectiveLoanFk: string;
  name: string;
  income: boolean;
  newPk: () => string;
}): Transaction[] {
  const out: Transaction[] = [];
  const per = Math.round((args.total / args.count) * 100) / 100;
  let allocated = 0;
  let date = new Date(args.startDate);

  for (let i = 0; i < args.count; i++) {
    const isLast = i === args.count - 1;
    const magnitude = isLast ? Math.round((args.total - allocated) * 100) / 100 : per;
    allocated += magnitude;

    out.push({
      transactionPk: args.newPk(),
      pairedTransactionFk: null,
      name: `${args.name} ${i + 1}/${args.count}`,
      amount: args.income ? magnitude : -magnitude,
      note: "",
      categoryFk: args.categoryFk,
      subCategoryFk: null,
      walletFk: args.walletPk,
      dateCreated: date.toISOString(),
      dateTimeModified: new Date().toISOString(),
      originalDateDue: date.toISOString(),
      income: args.income,
      periodLength: args.periodLength,
      reoccurrence: args.reoccurrence,
      endDate: null,
      upcomingTransactionNotification: true,
      type: TransactionSpecialType.upcoming,
      paid: false,
      createdAnotherFutureTransaction: true, // instalments are pre-generated
      skipPaid: false,
      methodAdded: null,
      transactionOwnerEmail: null,
      transactionOriginalOwnerEmail: null,
      sharedKey: null,
      sharedOldKey: null,
      sharedStatus: null,
      sharedDateUpdated: null,
      sharedReferenceBudgetPk: null,
      objectiveFk: null,
      objectiveLoanFk: args.objectiveLoanFk,
      budgetFksExclude: null,
    });

    date = getNextRecurrenceDate(date, args.reoccurrence, args.periodLength);
  }

  return out;
}
