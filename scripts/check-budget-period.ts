/**
 * Verifies the ported Cashew period arithmetic produces the boundaries the
 * Dart original does. Run with `npm run check:budget`.
 *
 * The cases below are the ones where a naive port goes wrong: month-end
 * clamping, a period that resets mid-month, and multi-unit period lengths.
 */

import {
  atMidday,
  firstDayOfMonth,
  fromDateInputValue,
  getBudgetDate,
  getDatePastToDetermineBudgetDate,
  justDay,
  toDateInputValue,
} from "../src/lib/budget/period";
import {
  getTotalSubscriptions,
  getBudgetSpent,
  getSpendingSummary,
} from "../src/lib/budget/calculations";
import { buildAllWallets } from "../src/lib/budget/currency";
import {
  BudgetReoccurence,
  TransactionSpecialType,
  type Budget,
  type Transaction,
  type TransactionWallet,
} from "../src/lib/budget/types";

let failures = 0;

function check(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${expected}\n        actual   ${actual}`);
}

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function makeBudget(over: Partial<Budget>): Budget {
  return {
    budgetPk: "b1",
    name: "Test",
    amount: 10000,
    colour: null,
    startDate: new Date(2026, 0, 1).toISOString(),
    endDate: new Date(2026, 11, 31).toISOString(),
    walletFks: null,
    categoryFks: null,
    categoryFksExclude: null,
    income: false,
    archived: false,
    addedTransactionsOnly: false,
    periodLength: 1,
    reoccurrence: BudgetReoccurence.monthly,
    dateCreated: new Date(2026, 0, 1).toISOString(),
    dateTimeModified: null,
    pinned: true,
    order: 0,
    walletFk: "0",
    budgetTransactionFilters: null,
    memberTransactionFilters: null,
    sharedKey: null,
    sharedOwnerMember: null,
    sharedDateUpdated: null,
    sharedMembers: null,
    sharedAllMembersEver: null,
    isAbsoluteSpendingLimit: false,
    ...over,
  };
}

console.log("=== justDay normalisation (matches Dart DateTime rollover) ===");
check(
  "Jan 31 + 1 month rolls to Mar 3 (2026 non-leap)",
  fmt(justDay(new Date(2026, 0, 31), { monthOffset: 1 })),
  "2026-03-03",
);
check("Dec 1 + 1 month crosses year", fmt(justDay(new Date(2026, 11, 1), { monthOffset: 1 })), "2027-01-01");
check("Mar 1 - 1 day", fmt(justDay(new Date(2026, 2, 1), { dayOffset: -1 })), "2026-02-28");

console.log("\n=== Date-input round trip (regression: UTC shift) ===");
{
  // `toISOString().slice(0,10)` used to move a local midnight back a day in any
  // timezone east of Greenwich, so a budget starting 1 Aug was stored as 31 Jul
  // and every period boundary came out one day early.
  const aug1 = new Date(2026, 7, 1);
  check("local date survives the round trip", toDateInputValue(aug1), "2026-08-01");
  check(
    "parsing an input value gives back the same day",
    fmt(fromDateInputValue(toDateInputValue(aug1))),
    "2026-08-01",
  );
  const budget = makeBudget({
    startDate: fromDateInputValue(toDateInputValue(firstDayOfMonth(new Date(2026, 7, 5)))).toISOString(),
  });
  const range = getBudgetDate(budget, new Date(2026, 7, 5));
  check("budget created 'this month' starts on the 1st", fmt(range.start), "2026-08-01");
  check("...and ends on the 31st", fmt(range.end), "2026-08-31");
  // Midday stamping keeps a transaction inside its own day under DST shifts.
  check("atMidday lands at 12:00 local", String(atMidday(aug1).getHours()), "12");
}

console.log("\n=== Monthly budget, period 1, started Jan 1 2026 ===");
{
  const b = makeBudget({});
  const r = getBudgetDate(b, new Date(2026, 7, 5)); // Aug 5
  check("August period start", fmt(r.start), "2026-08-01");
  check("August period end (inclusive)", fmt(r.end), "2026-08-31");

  const feb = getBudgetDate(b, new Date(2026, 1, 14));
  check("February period start", fmt(feb.start), "2026-02-01");
  check("February period end (28 days)", fmt(feb.end), "2026-02-28");
}

console.log("\n=== Monthly budget resetting on the 15th ===");
{
  const b = makeBudget({ startDate: new Date(2026, 0, 15).toISOString() });
  const r = getBudgetDate(b, new Date(2026, 7, 5)); // Aug 5 -> Jul 15..Aug 14
  check("mid-month period start", fmt(r.start), "2026-07-15");
  check("mid-month period end", fmt(r.end), "2026-08-14");

  const r2 = getBudgetDate(b, new Date(2026, 7, 20)); // Aug 20 -> Aug 15..Sep 14
  check("next period start", fmt(r2.start), "2026-08-15");
  check("next period end", fmt(r2.end), "2026-09-14");
}

console.log("\n=== Weekly budget, period 1, started Mon Jan 5 2026 ===");
{
  const b = makeBudget({
    reoccurrence: BudgetReoccurence.weekly,
    startDate: new Date(2026, 0, 5).toISOString(),
  });
  const r = getBudgetDate(b, new Date(2026, 7, 5)); // Wed Aug 5
  check("week start is a Monday", fmt(r.start), "2026-08-03");
  check("week end is the Sunday", fmt(r.end), "2026-08-09");
}

console.log("\n=== Daily budget, period 3 ===");
{
  const b = makeBudget({
    reoccurrence: BudgetReoccurence.daily,
    periodLength: 3,
    startDate: new Date(2026, 7, 1).toISOString(),
  });
  const r = getBudgetDate(b, new Date(2026, 7, 5));
  check("3-day period start", fmt(r.start), "2026-08-04");
  check("3-day period end", fmt(r.end), "2026-08-06");
}

console.log("\n=== Yearly budget ===");
{
  const b = makeBudget({
    reoccurrence: BudgetReoccurence.yearly,
    startDate: new Date(2024, 3, 1).toISOString(),
  });
  const r = getBudgetDate(b, new Date(2026, 7, 5));
  check("financial-year style start", fmt(r.start), "2026-04-01");
  check("financial-year style end", fmt(r.end), "2027-03-31");
}

console.log("\n=== Past period paging (index 1 = previous period) ===");
{
  const b = makeBudget({});
  const prev = getBudgetDate(b, getDatePastToDetermineBudgetDate(1, b));
  const cur = getBudgetDate(b, getDatePastToDetermineBudgetDate(0, b));
  const gapDays = Math.round((cur.start.getTime() - prev.start.getTime()) / 86400000);
  check("previous period is one month earlier", String(gapDays >= 28 && gapDays <= 31), "true");
  check("previous period ends the day before current", fmt(prev.end), fmt(justDay(cur.start, { dayOffset: -1 })));
}

console.log("\n=== Subscription period normalisation ===");
{
  const wallet: TransactionWallet = {
    walletPk: "0",
    name: "Bank",
    colour: null,
    iconName: null,
    dateCreated: new Date().toISOString(),
    dateTimeModified: null,
    order: 0,
    currency: "inr",
    currencyFormat: null,
    decimals: 2,
    homePageWidgetDisplay: null,
    accountType: null,
    creditLimit: null,
    statementDay: null,
    dueDay: null,
  };
  const allWallets = buildAllWallets([wallet], "0");

  const sub = (over: Partial<Transaction>): Transaction => ({
    transactionPk: Math.random().toString(),
    pairedTransactionFk: null,
    name: "Sub",
    amount: -100,
    note: "",
    categoryFk: "1",
    subCategoryFk: null,
    walletFk: "0",
    dateCreated: new Date(2026, 7, 1).toISOString(),
    dateTimeModified: null,
    originalDateDue: null,
    income: false,
    periodLength: 1,
    reoccurrence: BudgetReoccurence.monthly,
    endDate: null,
    upcomingTransactionNotification: true,
    type: TransactionSpecialType.subscription,
    paid: false,
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
    ...over,
  });

  // A ₹100/month sub is ₹1200/yr; a ₹1200/yr sub is ₹100/month.
  check(
    "monthly sub -> yearly total",
    getTotalSubscriptions(allWallets, "yearly", [sub({})]).toFixed(2),
    "-1200.00",
  );
  check(
    "yearly sub -> monthly total",
    getTotalSubscriptions(
      allWallets,
      "monthly",
      [sub({ amount: -1200, reoccurrence: BudgetReoccurence.yearly })],
    ).toFixed(2),
    "-100.00",
  );
  // Weekly uses the real month length: Aug 2026 has 31 days -> 31/7 weeks.
  const weeklyMonthly = getTotalSubscriptions(allWallets, "monthly", [
    sub({ amount: -10, reoccurrence: BudgetReoccurence.weekly }),
  ]);
  const expectedWeekly = (-10 * (new Date(2026, 7 + 1, 0).getDate() / 7)).toFixed(2);
  check("weekly sub -> monthly uses real month length", weeklyMonthly.toFixed(2), expectedWeekly);
  // periodLength 0 is skipped rather than dividing by zero.
  check(
    "periodLength 0 is skipped",
    getTotalSubscriptions(allWallets, "monthly", [sub({ periodLength: 0 })]).toFixed(2),
    "0.00",
  );

  console.log("\n=== Unpaid scheduled rows stay out of totals ===");
  const summary = getSpendingSummary(allWallets, [
    sub({ type: null, amount: -500, paid: true }),
    sub({ amount: -900, paid: false }), // unpaid subscription
  ]);
  check("only the settled expense counts", summary.expense.toFixed(2), "500.00");

  console.log("\n=== Budget spend respects the period window ===");
  const b = makeBudget({});
  const range = getBudgetDate(b, new Date(2026, 7, 5));
  const spent = getBudgetSpent(
    allWallets,
    [
      sub({ type: null, paid: true, amount: -300, dateCreated: new Date(2026, 7, 3).toISOString() }),
      sub({ type: null, paid: true, amount: -700, dateCreated: new Date(2026, 6, 3).toISOString() }), // July, out of range
      sub({ type: null, paid: true, amount: -50, dateCreated: new Date(2026, 7, 31).toISOString() }), // last day, in range
    ],
    b,
    range,
  );
  check("only August transactions count", spent.toFixed(2), "350.00");
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
