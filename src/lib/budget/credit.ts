/**
 * Credit cards and policies — the two things Cashew has no concept of.
 *
 * Cashew treats every account as a pot of money you own. A credit card is the
 * opposite: a negative balance is money you *owe*, bounded by a limit, settled
 * on a cycle. The maths below is small but easy to get backwards, so the sign
 * conventions are stated explicitly at each step.
 */

import {
  AccountType,
  BALANCE_CORRECTION_CATEGORY_PK,
  PREMIUM_FREQUENCY_META,
  PremiumFrequency,
  TRANSFER_CATEGORY_PK,
  type Policy,
  type Transaction,
  type TransactionCategory,
  type TransactionWallet,
} from "./types";
import { getWalletBalance } from "./calculations";
import { atMidday } from "./period";
import { amountRatioToPrimaryCurrencyGivenPk, type AllWallets } from "./currency";

// ---------------------------------------------------------------------------
// Credit cards
// ---------------------------------------------------------------------------

export function isCreditCard(wallet: TransactionWallet): boolean {
  return wallet.accountType === AccountType.creditCard;
}

export interface CreditCardStatus {
  /** Money owed, as a positive number. 0 when the card is clear. */
  outstanding: number;
  /** Limit − outstanding. Null when no limit is set. */
  available: number | null;
  /** outstanding / limit, 0–1+. Null when no limit is set. */
  utilisation: number | null;
  /** True past 30% — the threshold credit scoring treats as heavy use. */
  highUtilisation: boolean;
  /** Start and end of the billing period the card is currently in. */
  currentCycle: { start: Date; end: Date } | null;
  /** When this cycle's bill must be paid. */
  nextDueDate: Date | null;
  daysUntilDue: number | null;
  /** Spend booked inside the current cycle, as a positive number. */
  currentCycleSpend: number;
  /** The amount remaining to be paid from the previous statement cycle. */
  remainingStatementBalance: number;
}

/**
 * Clamp a day-of-month onto a given month.
 *
 * A card billing on the 30th still has to bill in February, so the day is
 * pulled back to the month's last day rather than rolling into March.
 */
export function dayInMonth(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

/**
 * Where a card stands right now.
 *
 * `getWalletBalance` returns a *negative* number for a card in debt (spending
 * is stored negative), so `outstanding` is its negation and a positive balance
 * — an overpaid card — reports zero owed rather than a negative debt.
 */
export function getCreditCardStatus(
  wallet: TransactionWallet,
  transactions: Transaction[],
  now: Date = new Date(),
): CreditCardStatus {
  const balance = getWalletBalance(transactions, wallet.walletPk);
  const outstanding = Math.max(0, -balance);

  const limit = wallet.creditLimit;
  const available = limit === null ? null : limit - outstanding;
  const utilisation = limit === null || limit <= 0 ? null : outstanding / limit;

  let currentCycle: { start: Date; end: Date } | null = null;
  let nextDueDate: Date | null = null;
  let daysUntilDue: number | null = null;

  if (wallet.statementDay !== null) {
    // The cycle ends on the statement day. If that day has not arrived this
    // month, the open cycle began last month.
    const thisMonthStatement = dayInMonth(now.getFullYear(), now.getMonth(), wallet.statementDay);
    const cycleEnd =
      now.getTime() <= thisMonthStatement.getTime()
        ? thisMonthStatement
        : dayInMonth(now.getFullYear(), now.getMonth() + 1, wallet.statementDay);
    const cycleStart = dayInMonth(
      cycleEnd.getFullYear(),
      cycleEnd.getMonth() - 1,
      wallet.statementDay,
    );
    currentCycle = { start: cycleStart, end: cycleEnd };

    if (wallet.dueDay !== null) {
      // The due day usually falls in the month *after* the statement closes;
      // when the number is larger it is still the same month.
      const sameMonth = dayInMonth(cycleEnd.getFullYear(), cycleEnd.getMonth(), wallet.dueDay);
      nextDueDate =
        sameMonth.getTime() > cycleEnd.getTime()
          ? sameMonth
          : dayInMonth(cycleEnd.getFullYear(), cycleEnd.getMonth() + 1, wallet.dueDay);
      daysUntilDue = Math.ceil((nextDueDate.getTime() - now.getTime()) / 86400000);
    }
  }

  let currentCycleSpend = 0;
  if (currentCycle) {
    for (const t of transactions) {
      if (t.walletFk !== wallet.walletPk) continue;
      if (!t.paid) continue;
      if (t.income) continue; // payments to the card are not spend
      const d = new Date(t.dateCreated).getTime();
      if (d >= currentCycle.start.getTime() && d <= currentCycle.end.getTime()) {
        currentCycleSpend += Math.abs(t.amount);
      }
    }
  }

  return {
    outstanding: Math.round(outstanding * 1e6) / 1e6,
    available: available === null ? null : Math.round(available * 1e6) / 1e6,
    utilisation,
    highUtilisation: utilisation !== null && utilisation > 0.3,
    currentCycle,
    nextDueDate,
    daysUntilDue,
    currentCycleSpend: Math.round(currentCycleSpend * 1e6) / 1e6,
    remainingStatementBalance: Math.max(0, Math.round((outstanding - currentCycleSpend) * 1e6) / 1e6),
  };
}

/** Total owed across every credit card, in the primary currency. */
export function getTotalCreditOutstanding(
  allWallets: AllWallets,
  transactions: Transaction[],
): number {
  let total = 0;
  for (const wallet of allWallets.list) {
    if (!isCreditCard(wallet)) continue;
    const { outstanding } = getCreditCardStatus(wallet, transactions);
    total += outstanding * amountRatioToPrimaryCurrencyGivenPk(allWallets, wallet.walletPk);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

/**
 * Advance a date by one premium period.
 *
 * Stamped at midday for the same reason transactions are: a due date held at
 * local midnight can tip to the previous day when read from another timezone
 * or across a DST change, silently making a policy look a day overdue.
 */
export function nextPremiumDate(from: Date, frequency: PremiumFrequency): Date {
  const months = PREMIUM_FREQUENCY_META[frequency].monthsBetween;
  if (months === 0) return from;
  // Clamp to the month end so a policy due on the 31st still bills in February.
  const target = new Date(from.getFullYear(), from.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return atMidday(
    new Date(target.getFullYear(), target.getMonth(), Math.min(from.getDate(), lastDay)),
  );
}

export interface PolicyStatus {
  /** Sum of transactions linked to this policy, as a positive number. */
  totalPaid: number;
  premiumsPaid: number;
  /** Premium × periods per year. 0 for one-time policies. */
  annualCommitment: number;
  nextDueDate: Date | null;
  daysUntilDue: number | null;
  isOverdue: boolean;
  /** Elapsed share of start→maturity, 0–1. Null without a maturity date. */
  termProgress: number | null;
  monthsToMaturity: number | null;
  matured: boolean;
}

/**
 * A policy's current state.
 *
 * Premiums are identified by note tag rather than a foreign key on the
 * transaction: policies are an extension, and adding a column to `Transaction`
 * would break round-tripping with Cashew's own export. The tag is written by
 * `createPremiumTransaction` and is stable.
 */
export function policyPremiumTag(policy: Policy): string {
  return `policy:${policy.policyPk}`;
}

export function getPolicyTransactions(policy: Policy, transactions: Transaction[]): Transaction[] {
  const tag = policyPremiumTag(policy);
  return transactions.filter((t) => t.note.includes(tag));
}

/**
 * The category a premium should be filed under, resolved against the ledger
 * that actually exists.
 *
 * A bare `policy.categoryFk ?? "6"` assumes the default category set is still
 * present. Anyone who built their own categories has no pk `"6"`, so every
 * premium was stamped with an id nothing resolves to and the whole lot piled up
 * under "Uncategorised". The same happens to a policy whose category was later
 * deleted, because a dangling pk is not null and slips past `??`.
 */
export function resolvePremiumCategoryFk(
  policy: Pick<Policy, "categoryFk">,
  categories: TransactionCategory[],
): string | null {
  const exists = (pk: string | null | undefined) =>
    Boolean(pk) && categories.some((c) => c.categoryPk === pk);

  if (exists(policy.categoryFk)) return policy.categoryFk;

  const spendable = categories.filter(
    (c) =>
      !c.income &&
      c.categoryPk !== BALANCE_CORRECTION_CATEGORY_PK &&
      c.categoryPk !== TRANSFER_CATEGORY_PK,
  );

  const byName = spendable.find((c) => c.name.trim().toLowerCase() === "bills & fees");
  if (byName) return byName.categoryPk;

  const sorted = [...spendable].sort((a, b) => a.order - b.order);
  return sorted[0]?.categoryPk ?? null;
}

export function getPolicyStatus(
  policy: Policy,
  transactions: Transaction[],
  now: Date = new Date(),
): PolicyStatus {
  const linked = getPolicyTransactions(policy, transactions).filter((t) => t.paid);
  const totalPaid = linked.reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // A record-only policy is a ledger, not a commitment: there is no schedule to
  // be ahead of or behind, so it never reads as due, overdue, or as an annual
  // outgo figure that was never agreed.
  const recordOnly = policy.recordOnly === true;

  const perYear = PREMIUM_FREQUENCY_META[policy.premiumFrequency].perYear;
  const annualCommitment = recordOnly ? 0 : policy.premiumAmount * perYear;

  const nextDue = recordOnly || !policy.nextDueDate ? null : new Date(policy.nextDueDate);
  const daysUntilDue = nextDue
    ? Math.ceil((nextDue.getTime() - now.getTime()) / 86400000)
    : null;

  const maturity = policy.maturityDate ? new Date(policy.maturityDate) : null;
  const start = new Date(policy.startDate);
  let termProgress: number | null = null;
  let monthsToMaturity: number | null = null;

  if (maturity) {
    const span = maturity.getTime() - start.getTime();
    termProgress = span <= 0 ? 1 : Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / span));
    monthsToMaturity = Math.max(
      0,
      (maturity.getFullYear() - now.getFullYear()) * 12 + (maturity.getMonth() - now.getMonth()),
    );
  }

  return {
    totalPaid,
    premiumsPaid: linked.length,
    annualCommitment,
    nextDueDate: nextDue,
    daysUntilDue,
    isOverdue: daysUntilDue !== null && daysUntilDue < 0,
    termProgress,
    monthsToMaturity,
    matured: maturity !== null && maturity.getTime() <= now.getTime(),
  };
}

/** Total yearly outgo across active policies, in the primary currency. */
export function getTotalAnnualPremiums(
  allWallets: AllWallets,
  policies: Policy[],
): number {
  let total = 0;
  for (const policy of policies) {
    if (policy.archived) continue;
    const perYear = PREMIUM_FREQUENCY_META[policy.premiumFrequency].perYear;
    total +=
      policy.premiumAmount *
      perYear *
      amountRatioToPrimaryCurrencyGivenPk(allWallets, policy.walletFk);
  }
  return total;
}

/**
 * Everything paid into policies, in the primary currency — the savings side of
 * a premium.
 *
 * Premiums are excluded from spending because the money is put aside rather
 * than consumed, which leaves it invisible unless it is counted somewhere. This
 * is that somewhere. It is what has been *paid in*, not a surrender or maturity
 * value: those are usually lower, and this app has no way to know them.
 *
 * `excludedPolicyPks` drops individual policies from the total — a term
 * insurance premium buys cover rather than accumulating, so counting it as
 * savings would overstate what you hold.
 */
export function getPolicySavingsTotal(
  allWallets: AllWallets,
  policies: Policy[],
  transactions: Transaction[],
  excludedPolicyPks: string[] = [],
): number {
  const excluded = new Set(excludedPolicyPks);
  let total = 0;
  for (const policy of policies) {
    if (policy.archived || excluded.has(policy.policyPk)) continue;
    const { totalPaid } = getPolicyStatus(policy, transactions);
    total += totalPaid * amountRatioToPrimaryCurrencyGivenPk(allWallets, policy.walletFk);
  }
  return total;
}

/** Combined life cover across insurance policies that state a sum assured. */
export function getTotalSumAssured(policies: Policy[]): number {
  return policies
    .filter((p) => !p.archived && p.sumAssured !== null)
    .reduce((sum, p) => sum + (p.sumAssured ?? 0), 0);
}
