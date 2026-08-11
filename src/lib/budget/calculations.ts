/**
 * Every total Cashew shows, ported from `tables.dart`, `functions.dart` and
 * `spendingSummaryHelper.dart`.
 *
 * Two rules run through all of it and are easy to get wrong:
 *
 * 1. **Currency.** Cashew sums per-account and multiplies each account's
 *    subtotal by its ratio to the primary currency. Summing raw amounts across
 *    accounts is only correct when every account shares a currency.
 * 2. **`paid`.** Upcoming/subscription/repetitive rows exist before they happen.
 *    They must not count toward spending until `paid` is true — the one
 *    exception being account balances, which Cashew also gates on `paid`.
 */

import {
  BALANCE_CORRECTION_CATEGORY_PK,
  TRANSFER_CATEGORY_PK,
  BudgetReoccurence,
  BudgetTransactionFilters,
  ObjectiveType,
  TransactionSpecialType,
  type Budget,
  type CategoryBudgetLimit,
  type Objective,
  type Transaction,
  type TransactionCategory,
} from "./types";
import { getBudgetDate, type DateTimeRange } from "./period";
import {
  amountRatioToPrimaryCurrency,
  amountRatioToPrimaryCurrencyGivenPk,
  type AllWallets,
} from "./currency";

// ---------------------------------------------------------------------------
// Transaction predicates
// ---------------------------------------------------------------------------

/** Lent/borrowed money — excluded from ordinary spending totals. */
export function isCreditDebt(t: Transaction): boolean {
  return t.type === TransactionSpecialType.credit || t.type === TransactionSpecialType.debt;
}

/** A manual adjustment made to bring an account in line with reality. */
export function isBalanceCorrection(t: Transaction): boolean {
  return t.categoryFk === BALANCE_CORRECTION_CATEGORY_PK;
}

/** One half of a movement between two of your own accounts. */
export function isTransfer(t: Transaction): boolean {
  return t.categoryFk === TRANSFER_CATEGORY_PK;
}

/**
 * The `policy:<pk>` note tag written by `createPremiumTransaction`.
 *
 * Anchored to a word boundary and required to carry a pk, so an ordinary note
 * that merely mentions a policy does not read as a tagged premium. Kept here
 * rather than imported from `credit.ts` because that module already imports
 * from this one.
 */
const POLICY_TAG_PATTERN = /(?:^|\s)policy:\S+/;

/**
 * A premium payment linked to a policy by its note tag.
 *
 * Matches the tag only. Earlier revisions also treated any transaction whose
 * name contained "premium" as one, which silently swallowed every Spotify
 * Premium and LinkedIn Premium in the ledger — `createPremiumTransaction`
 * always writes the tag, so the name never carried information the tag lacked.
 */
export function isPolicyPremium(t: Transaction): boolean {
  return POLICY_TAG_PATTERN.test(t.note ?? "");
}

/**
 * Moves an account balance without being income or expense.
 *
 * Covers reserved categories, transfers, balance corrections, and policy premiums.
 */
export function isExcludedFromTotals(t: Transaction, objectives: Objective[] = []): boolean {
  if (isBalanceCorrection(t) || isTransfer(t) || isPolicyPremium(t)) return true;
  
  if (t.objectiveLoanFk) {
    const loan = objectives.find((o) => o.objectivePk === t.objectiveLoanFk);
    if (!loan) return true;

    // The user requested: "paying the borrowed money should count in expenses but 
    // when i am lenting or collecting that money should not counted in expense or income."
    // Borrowed loan -> loan.income = true
    // Paying it back -> t.income = false
    if (loan.income === true && t.income === false) {
      return false; // DO NOT exclude (count as expense)
    }
    
    // Everything else (lenting, collecting, receiving borrowed money) is excluded
    return true;
  }

  return false;
}

/** A row that has actually happened, so it counts toward totals. */
export function countsTowardsTotal(t: Transaction): boolean {
  if (t.type === null || t.type === undefined) return true;
  if (isCreditDebt(t)) return false;
  return t.paid;
}

/** A row that has actually executed and moved money in the real world. */
export function affectsWalletBalance(t: Transaction): boolean {
  if (t.skipPaid) return false;
  if (t.type === null || t.type === undefined) return true;
  return t.paid;
}

/** An unpaid, non-skipped scheduled row whose date has passed. */
export function isOverdue(t: Transaction, now: Date = new Date()): boolean {
  if (t.paid || t.skipPaid) return false;
  if (t.type === null || t.type === undefined) return false;
  if (isCreditDebt(t)) return false;
  return new Date(t.dateCreated).getTime() < now.getTime();
}

export function isUpcoming(t: Transaction, now: Date = new Date()): boolean {
  if (t.paid || t.skipPaid) return false;
  if (t.type === null || t.type === undefined) return false;
  if (isCreditDebt(t)) return false;
  return new Date(t.dateCreated).getTime() >= now.getTime();
}

// ---------------------------------------------------------------------------
// Budget membership
// ---------------------------------------------------------------------------

function hasFilter(budget: Budget, filter: BudgetTransactionFilters): boolean {
  return (budget.budgetTransactionFilters ?? []).includes(filter);
}

/**
 * Whether `transaction` counts toward `budget` for the given period.
 *
 * Mirrors the `where` clause Cashew builds in `getTransactionsInTimeRange`.
 * Order matters: the explicit per-transaction exclusion beats every widening
 * filter, and "added only" budgets ignore category/account criteria entirely.
 */
export function isInBudget(
  budget: Budget,
  t: Transaction,
  range: DateTimeRange,
  categories: TransactionCategory[],
  objectives: Objective[] = [],
): boolean {
  if (!countsTowardsTotal(t)) return false;
  if (isExcludedFromTotals(t, objectives)) return false;
  // Explicitly excluded from this budget by the user.
  if ((t.budgetFksExclude ?? []).includes(budget.budgetPk)) return false;

  const date = new Date(t.dateCreated).getTime();
  const startOfDay = new Date(
    range.start.getFullYear(),
    range.start.getMonth(),
    range.start.getDate(),
  ).getTime();
  // `range.end` is an inclusive day, so admit anything before the next midnight.
  const endOfDay = new Date(
    range.end.getFullYear(),
    range.end.getMonth(),
    range.end.getDate() + 1,
  ).getTime();
  if (date < startOfDay || date >= endOfDay) return false;

  // "Added only" budgets are a manual bucket: membership is the sole criterion.
  if (budget.addedTransactionsOnly) {
    return t.sharedReferenceBudgetPk === budget.budgetPk;
  }

  // Transfers and corrections are opt-in.
  if (isExcludedFromTotals(t, objectives)) {
    return hasFilter(budget, BudgetTransactionFilters.includeBalanceCorrection);
  }

  // Lent/borrowed are opt-in.
  if (isCreditDebt(t) && !hasFilter(budget, BudgetTransactionFilters.includeDebtAndCredit)) {
    return false;
  }

  // A spending budget counts expenses; a savings budget counts income. Cashew
  // always includes the matching direction and makes the opposite opt-in.
  if (budget.income !== t.income) {
    if (!hasFilter(budget, BudgetTransactionFilters.includeIncome)) return false;
  }

  // Transactions already committed to another budget/objective are opt-in.
  if (
    t.sharedReferenceBudgetPk !== null &&
    t.sharedReferenceBudgetPk !== budget.budgetPk &&
    !hasFilter(budget, BudgetTransactionFilters.addedToOtherBudget)
  ) {
    return false;
  }
  if (
    t.objectiveFk !== null &&
    !hasFilter(budget, BudgetTransactionFilters.addedToObjective)
  ) {
    return false;
  }

  // Account scope.
  const walletFks = budget.walletFks ?? [];
  if (walletFks.length > 0 && !walletFks.includes(t.walletFk)) return false;

  // Category scope. A selected parent category also admits its subcategories,
  // which is why the category list has to be consulted here.
  const categoryFks = budget.categoryFks ?? [];
  if (categoryFks.length > 0) {
    const matches =
      categoryFks.includes(t.categoryFk) ||
      (t.subCategoryFk !== null && categoryFks.includes(t.subCategoryFk)) ||
      categories.some(
        (c) =>
          c.categoryPk === t.categoryFk &&
          c.mainCategoryPk !== null &&
          categoryFks.includes(c.mainCategoryPk),
      );
    if (!matches) return false;
  }

  const categoryFksExclude = budget.categoryFksExclude ?? [];
  if (categoryFksExclude.length > 0) {
    if (
      categoryFksExclude.includes(t.categoryFk) ||
      (t.subCategoryFk !== null && categoryFksExclude.includes(t.subCategoryFk))
    ) {
      return false;
    }
  }

  return true;
}

export function getBudgetTransactions(
  transactions: Transaction[],
  budget: Budget,
  range: DateTimeRange,
  categories: TransactionCategory[] = [],
  objectives: Objective[] = [],
): Transaction[] {
  return transactions.filter((t) => isInBudget(budget, t, range, categories, objectives));
}

/**
 * Amount spent (or saved) in a budget period, in the primary currency.
 *
 * Returned positive for a spending budget that has spending, matching how
 * Cashew renders "₹4,200 of ₹10,000". Amounts are stored negative for expenses,
 * hence the sign flip for non-income budgets.
 */
export function getBudgetSpent(
  allWallets: AllWallets,
  transactions: Transaction[],
  budget: Budget,
  range: DateTimeRange,
  categories: TransactionCategory[] = [],
  objectives: Objective[] = [],
): number {
  const members = getBudgetTransactions(transactions, budget, range, categories, objectives);
  let total = 0;
  for (const t of members) {
    total += t.amount * amountRatioToPrimaryCurrencyGivenPk(allWallets, t.walletFk);
  }
  return budget.income ? total : -total;
}

/** Per-category totals inside a budget period, largest first. */
export function getBudgetSpentByCategory(
  allWallets: AllWallets,
  transactions: Transaction[],
  budget: Budget,
  range: DateTimeRange,
  categories: TransactionCategory[] = [],
): Map<string, number> {
  const members = getBudgetTransactions(transactions, budget, range, categories);
  const byCategory = new Map<string, number>();
  for (const t of members) {
    const converted = t.amount * amountRatioToPrimaryCurrencyGivenPk(allWallets, t.walletFk);
    const value = budget.income ? converted : -converted;
    byCategory.set(t.categoryFk, (byCategory.get(t.categoryFk) ?? 0) + value);
  }
  return new Map([...byCategory.entries()].sort((a, b) => b[1] - a[1]));
}

/**
 * The spending cap for one category in a budget.
 *
 * With `isAbsoluteSpendingLimit` off, a category's limit is a *share* of the
 * budget total and Cashew scales it so the shares never exceed the budget.
 */
export function getCategoryLimitAmount(
  budget: Budget,
  limits: CategoryBudgetLimit[],
  categoryPk: string,
): number | null {
  const limit = limits.find((l) => l.budgetFk === budget.budgetPk && l.categoryFk === categoryPk);
  if (!limit) return null;
  if (budget.isAbsoluteSpendingLimit) return limit.amount;

  const budgetLimits = limits.filter((l) => l.budgetFk === budget.budgetPk);
  const totalLimits = budgetLimits.reduce((sum, l) => sum + l.amount, 0);
  if (totalLimits <= budget.amount || totalLimits === 0) return limit.amount;
  return (limit.amount / totalLimits) * budget.amount;
}

// ---------------------------------------------------------------------------
// Objectives (goals and loans)
// ---------------------------------------------------------------------------

/**
 * Progress toward an objective, in the primary currency.
 *
 * Ported from `watchTotalTowardsObjective`: only `paid` rows count, goals read
 * `objectiveFk` and loans read `objectiveLoanFk`, and each account's subtotal
 * is converted before being added.
 */
export function getTotalTowardsObjective(
  allWallets: AllWallets,
  transactions: Transaction[],
  objective: Objective,
): number {
  let total = 0;
  for (const t of transactions) {
    if (!t.paid) continue;
    const linked =
      objective.type === ObjectiveType.loan
        ? t.objectiveLoanFk === objective.objectivePk
        : t.objectiveFk === objective.objectivePk;
    if (!linked) continue;

    // For fixed loans, only sum the repayments to calculate progress. 
    // Repayments run in the opposite direction of the loan's origin.
    // (e.g. Lent loan is income=false, but repayments are income=true).
    if (objective.type === ObjectiveType.loan && objective.amount !== -1) {
      if (t.income === objective.income) continue;
    }

    total += t.amount * amountRatioToPrimaryCurrencyGivenPk(allWallets, t.walletFk);
  }
  // Savings goals accumulate income (positive), spending goals expenses.
  //
  // Loans invert that: `income` describes how the money arrived (borrowed =
  // income), but progress is made by the repayments, which run the *opposite*
  // direction — so a borrowed loan advances on expenses. Report progress as a
  // positive magnitude either way.
  if (objective.type === ObjectiveType.loan) return objective.income ? -total : total;
  return objective.income ? total : -total;
}

export function getObjectivePercentageComplete(
  allWallets: AllWallets,
  transactions: Transaction[],
  objective: Objective,
): number {
  const total = getTotalTowardsObjective(allWallets, transactions, objective);
  if (objective.amount === 0) return 0;
  return total / objective.amount;
}

/**
 * A loan with `amount === -1` is Cashew's "indefinite" loan: no fixed total,
 * it just tracks the running balance with someone.
 */
export function isIndefiniteLoan(objective: Objective): boolean {
  return objective.type === ObjectiveType.loan && objective.amount === -1;
}

/** Net position on an indefinite loan: positive means they owe you. */
export function getIndefiniteLoanBalance(
  allWallets: AllWallets,
  transactions: Transaction[],
  objective: Objective,
): number {
  let total = 0;
  for (const t of transactions) {
    if (!t.paid) continue;
    if (t.objectiveLoanFk !== objective.objectivePk) continue;
    total += t.amount * amountRatioToPrimaryCurrencyGivenPk(allWallets, t.walletFk);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Accounts and net worth
// ---------------------------------------------------------------------------

/**
 * An account's balance, in its own currency.
 *
 * Only `paid` rows move a balance, so a scheduled bill does not debit the
 * account until it is actually paid.
 */
export function getWalletBalance(transactions: Transaction[], walletPk: string): number {
  let total = 0;
  for (const t of transactions) {
    if (t.walletFk !== walletPk) continue;
    if (!affectsWalletBalance(t)) continue;
    total += t.amount;
  }
  return total;
}

/** Sum of every account balance, converted to the primary currency. */
/**
 * `extraAssets` covers holdings that are not accounts — policy savings, today.
 * Passed in rather than computed here so this stays a function of balances, and
 * so a caller that has not opted in cannot pick the figure up by accident.
 */
export function getNetWorth(
  allWallets: AllWallets,
  transactions: Transaction[],
  extraAssets = 0,
): number {
  let total = extraAssets;
  for (const wallet of allWallets.list) {
    if (wallet.excludeFromNetWorth) continue;
    let balance = getWalletBalance(transactions, wallet.walletPk);
    
    // For credit cards, only deduct the billed statement balance.
    if (wallet.accountType === 2) { // 2 is AccountType.creditCard
      const { getCreditCardStatus } = require("./credit");
      const card = getCreditCardStatus(wallet, transactions);
      balance = -card.remainingStatementBalance;
    }
    
    total += balance * amountRatioToPrimaryCurrency(allWallets, wallet.currency);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Subscriptions and upcoming
// ---------------------------------------------------------------------------

export type SelectedSubscriptionsType = "monthly" | "yearly" | "total";

/**
 * Normalise recurring costs onto a common period — ported from
 * `getTotalSubscriptions`.
 *
 * The month length is the *current* month's real day count and the year length
 * is the current year's real day count, so the figure shifts slightly in
 * February and in leap years. That is Cashew's behaviour, kept deliberately.
 * One-off `upcoming` rows are added at face value regardless of the mode.
 */
export function getTotalSubscriptions(
  allWallets: AllWallets,
  type: SelectedSubscriptionsType,
  subscriptions: Transaction[] | null,
): number {
  let total = 0;
  const today = new Date();
  if (!subscriptions) return 0;

  for (const original of subscriptions) {
    const amount =
      original.amount * (amountRatioToPrimaryCurrencyGivenPk(allWallets, original.walletFk) ?? 0);
    const periodLength = original.periodLength ?? 1;

    if (original.type === TransactionSpecialType.upcoming) {
      total += amount;
      continue;
    }
    if (original.periodLength === 0) continue;

    if (type === "monthly") {
      // Day 0 of next month === last day of this month.
      const numDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const numWeeks = numDays / 7;
      if (original.reoccurrence === BudgetReoccurence.daily) total += (amount * numDays) / periodLength;
      else if (original.reoccurrence === BudgetReoccurence.weekly)
        total += (amount * numWeeks) / periodLength;
      else if (original.reoccurrence === BudgetReoccurence.monthly) total += amount / periodLength;
      else if (original.reoccurrence === BudgetReoccurence.yearly)
        total += amount / 12 / periodLength;
    } else if (type === "yearly") {
      const firstDay = new Date(today.getFullYear(), 0, 1);
      const lastDay = new Date(today.getFullYear() + 1, 0, 1);
      const numDays = Math.round((lastDay.getTime() - firstDay.getTime()) / 86400000);
      const numWeeks = numDays / 7;
      if (original.reoccurrence === BudgetReoccurence.daily) total += (amount * numDays) / periodLength;
      else if (original.reoccurrence === BudgetReoccurence.weekly)
        total += (amount * numWeeks) / periodLength;
      else if (original.reoccurrence === BudgetReoccurence.monthly)
        total += (amount * 12) / periodLength;
      else if (original.reoccurrence === BudgetReoccurence.yearly) total += amount / periodLength;
    } else {
      // "total" is the raw sum of one cycle of each subscription.
      total += amount;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Spending summary
// ---------------------------------------------------------------------------

export interface SpendingSummary {
  income: number;
  expense: number;
  /** income − expense, both as positive magnitudes. */
  net: number;
  transactionCount: number;
}

/**
 * Income/expense/net over a set of transactions.
 *
 * Balance corrections are skipped: per Cashew, they "do not contribute to total
 * income and expense calculations but factor into net total spending", so they
 * belong in account balances (above) and not here.
 */
export function getSpendingSummary(
  allWallets: AllWallets,
  transactions: Transaction[],
  objectives: Objective[] = [],
): SpendingSummary {
  let income = 0;
  let expense = 0;
  let count = 0;

  for (const t of transactions) {
    if (!countsTowardsTotal(t)) continue;
    if (isExcludedFromTotals(t, objectives)) continue;
    const converted = t.amount * amountRatioToPrimaryCurrencyGivenPk(allWallets, t.walletFk);
    if (t.income) income += converted;
    else expense += converted;
    count++;
  }

  return { income, expense: -expense, net: income + expense, transactionCount: count };
}

/**
 * Totals per category over a set of transactions, largest magnitude first.
 *
 * Income is grouped exactly like spending: by the category the transaction was
 * filed under. An earlier revision guessed a subcategory for income by looking
 * for words like "salary" or "bank" in the name, and filed anything it could
 * not place under Salary. That rewrote categories the user had chosen — every
 * top-level income category, not just the seeded one — and reported salary that
 * had never been earned. A breakdown has to report what was recorded.
 */
export function getSpendingByCategory(
  allWallets: AllWallets,
  transactions: Transaction[],
  { income }: { income: boolean },
  objectives: Objective[] = [],
): Map<string, number> {
  return new Map(
    [...getCategoryTotals(allWallets, transactions, { income }, objectives)].map(([pk, v]) => [
      pk,
      v.sum,
    ]),
  );
}

/**
 * The same totals with the number of transactions behind each one.
 *
 * A share of spending reads very differently depending on whether it is one
 * large payment or fifty small ones, so the breakdown reports both.
 */
export function getCategoryTotals(
  allWallets: AllWallets,
  transactions: Transaction[],
  { income }: { income: boolean },
  objectives: Objective[] = [],
): Map<string, { sum: number; count: number }> {
  const byCategory = new Map<string, { sum: number; count: number }>();

  for (const t of transactions) {
    if (!countsTowardsTotal(t)) continue;
    if (isExcludedFromTotals(t, objectives)) continue;
    if (t.income !== income) continue;
    const converted = t.amount * amountRatioToPrimaryCurrencyGivenPk(allWallets, t.walletFk);

    const existing = byCategory.get(t.categoryFk) ?? { sum: 0, count: 0 };
    byCategory.set(t.categoryFk, {
      sum: existing.sum + Math.abs(converted),
      count: existing.count + 1,
    });
  }
  return new Map([...byCategory.entries()].sort((a, b) => b[1].sum - a[1].sum));
}

/** Daily net totals across a range, for the line graph and heatmap. */
export function getDailyTotals(
  allWallets: AllWallets,
  transactions: Transaction[],
  start: Date,
  end: Date,
): Map<string, number> {
  const byDay = new Map<string, number>();
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor.getTime() <= last.getTime()) {
    byDay.set(dayKey(cursor), 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const t of transactions) {
    if (!countsTowardsTotal(t)) continue;
    const d = new Date(t.dateCreated);
    const key = dayKey(d);
    if (!byDay.has(key)) continue;
    byDay.set(
      key,
      (byDay.get(key) ?? 0) + t.amount * amountRatioToPrimaryCurrencyGivenPk(allWallets, t.walletFk),
    );
  }
  return byDay;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Running cumulative total across a range, for the budget line graph. */
export function getCumulativeTotals(
  allWallets: AllWallets,
  transactions: Transaction[],
  start: Date,
  end: Date,
): { date: string; value: number }[] {
  const daily = getDailyTotals(allWallets, transactions, start, end);
  let running = 0;
  return [...daily.entries()].map(([date, value]) => {
    running += value;
    return { date, value: running };
  });
}

/**
 * Convenience wrapper: the current period of a budget plus its headline totals.
 */
export function getBudgetSnapshot(
  allWallets: AllWallets,
  transactions: Transaction[],
  budget: Budget,
  categories: TransactionCategory[] = [],
  atDate: Date = new Date(),
  objectives: Objective[] = [],
) {
  const range = getBudgetDate(budget, atDate);
  const spent = getBudgetSpent(allWallets, transactions, budget, range, categories, objectives);
  const remaining = budget.amount - spent;
  const percent = budget.amount === 0 ? 0 : spent / budget.amount;
  const totalDays = Math.max(
    1,
    Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1,
  );
  const daysElapsed = Math.min(
    totalDays,
    Math.max(0, Math.round((atDate.getTime() - range.start.getTime()) / 86400000) + 1),
  );
  const daysRemaining = Math.max(0, totalDays - daysElapsed);

  return {
    range,
    spent,
    remaining,
    percent,
    totalDays,
    daysElapsed,
    daysRemaining,
    /** What's left per remaining day — Cashew's "you can spend" figure. */
    perDayRemaining: daysRemaining > 0 ? remaining / daysRemaining : remaining,
  };
}
