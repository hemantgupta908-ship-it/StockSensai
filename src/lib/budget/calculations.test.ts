/**
 * Budget money math.
 *
 * These are the functions whose output is a rupee figure the user reads and
 * acts on. Several encode decisions that are easy to reverse by accident later
 * — policy premiums being savings rather than expenses, scheduled rows not
 * moving a balance until paid — so those are pinned explicitly rather than
 * left to be rediscovered.
 */

import { describe, expect, it } from "vitest";

import {
  affectsWalletBalance,
  countsTowardsTotal,
  getNetWorth,
  getWalletBalance,
  isBalanceCorrection,
  isCreditDebt,
  isExcludedFromTotals,
  isOverdue,
  isPolicyPremium,
  isTransfer,
  isUpcoming,
} from "./calculations";
import { createTransaction } from "./factory";
import { buildAllWallets } from "./currency";
import type { TransactionWallet } from "./types";
import {
  BALANCE_CORRECTION_CATEGORY_PK,
  TRANSFER_CATEGORY_PK,
  TransactionSpecialType,
  type Objective,
  type Transaction,
} from "./types";

const txn = (over: Partial<Transaction> = {}) => createTransaction(over);

describe("isPolicyPremium", () => {
  it("matches a tagged premium", () => {
    expect(isPolicyPremium(txn({ note: "policy:pol-123" }))).toBe(true);
  });

  it("matches a tag that follows other text", () => {
    expect(isPolicyPremium(txn({ note: "August LIC policy:pol-123" }))).toBe(true);
  });

  it("does not match an ordinary subscription named Premium", () => {
    // The regression this guards: matching on the word "premium" swallowed
    // every Spotify Premium in the ledger and filed it as savings.
    expect(isPolicyPremium(txn({ name: "Spotify Premium", note: "" }))).toBe(false);
    expect(isPolicyPremium(txn({ name: "LinkedIn Premium", note: "monthly premium" }))).toBe(false);
  });

  it("does not match a note that merely mentions a policy", () => {
    expect(isPolicyPremium(txn({ note: "check the policy documents" }))).toBe(false);
  });

  it("requires the tag to carry a pk", () => {
    expect(isPolicyPremium(txn({ note: "policy:" }))).toBe(false);
  });

  it("handles a missing note", () => {
    expect(isPolicyPremium(txn({ note: null as unknown as string }))).toBe(false);
  });
});

describe("reserved-category predicates", () => {
  it("identifies a balance correction", () => {
    expect(isBalanceCorrection(txn({ categoryFk: BALANCE_CORRECTION_CATEGORY_PK }))).toBe(true);
    expect(isBalanceCorrection(txn({ categoryFk: "3" }))).toBe(false);
  });

  it("identifies a transfer", () => {
    expect(isTransfer(txn({ categoryFk: TRANSFER_CATEGORY_PK }))).toBe(true);
  });

  it("keeps transfer and correction distinct", () => {
    // They were conflated in Cashew; separating them is a deliberate change,
    // because a transfer moves money you have and a correction invents it.
    expect(TRANSFER_CATEGORY_PK).not.toBe(BALANCE_CORRECTION_CATEGORY_PK);
    expect(isTransfer(txn({ categoryFk: BALANCE_CORRECTION_CATEGORY_PK }))).toBe(false);
  });

  it("identifies credit and debt rows", () => {
    expect(isCreditDebt(txn({ type: TransactionSpecialType.credit }))).toBe(true);
    expect(isCreditDebt(txn({ type: TransactionSpecialType.debt }))).toBe(true);
    expect(isCreditDebt(txn({ type: null }))).toBe(false);
  });
});

describe("isExcludedFromTotals", () => {
  it("excludes transfers, corrections and policy premiums", () => {
    expect(isExcludedFromTotals(txn({ categoryFk: TRANSFER_CATEGORY_PK }))).toBe(true);
    expect(isExcludedFromTotals(txn({ categoryFk: BALANCE_CORRECTION_CATEGORY_PK }))).toBe(true);
    expect(isExcludedFromTotals(txn({ note: "policy:pol-1" }))).toBe(true);
  });

  it("includes an ordinary expense", () => {
    expect(isExcludedFromTotals(txn({ name: "Groceries", amount: -1200 }))).toBe(false);
  });

  it("counts repaying borrowed money as a real expense", () => {
    const loan: Objective = { objectivePk: "l1", income: true } as Objective;
    const repayment = txn({ objectiveLoanFk: "l1", income: false });
    expect(isExcludedFromTotals(repayment, [loan])).toBe(false);
  });

  it("excludes lending money out", () => {
    const lent: Objective = { objectivePk: "l2", income: false } as Objective;
    expect(isExcludedFromTotals(txn({ objectiveLoanFk: "l2", income: false }), [lent])).toBe(true);
  });

  it("excludes collecting a loan back", () => {
    const lent: Objective = { objectivePk: "l2", income: false } as Objective;
    expect(isExcludedFromTotals(txn({ objectiveLoanFk: "l2", income: true }), [lent])).toBe(true);
  });

  it("excludes a row whose loan no longer exists", () => {
    // Safer to omit than to guess which side of a deleted loan it was.
    expect(isExcludedFromTotals(txn({ objectiveLoanFk: "gone" }), [])).toBe(true);
  });
});

describe("countsTowardsTotal", () => {
  it("counts a plain transaction", () => {
    expect(countsTowardsTotal(txn({ type: null }))).toBe(true);
  });

  it("does not count credit or debt", () => {
    expect(countsTowardsTotal(txn({ type: TransactionSpecialType.credit }))).toBe(false);
  });

  it("counts a scheduled row only once paid", () => {
    expect(countsTowardsTotal(txn({ type: TransactionSpecialType.subscription, paid: false }))).toBe(
      false,
    );
    expect(countsTowardsTotal(txn({ type: TransactionSpecialType.subscription, paid: true }))).toBe(
      true,
    );
  });
});

describe("affectsWalletBalance", () => {
  it("ignores a skipped row", () => {
    expect(affectsWalletBalance(txn({ skipPaid: true, paid: true }))).toBe(false);
  });

  it("moves the balance for a plain transaction", () => {
    expect(affectsWalletBalance(txn({ type: null }))).toBe(true);
  });

  it("waits for a scheduled row to be paid", () => {
    expect(
      affectsWalletBalance(txn({ type: TransactionSpecialType.upcoming, paid: false })),
    ).toBe(false);
  });

  it("differs from countsTowardsTotal for credit rows", () => {
    // A loan moves the account balance but is not spending. Collapsing these
    // two predicates would double-count one or hide the other.
    const credit = txn({ type: TransactionSpecialType.credit, paid: true });
    expect(affectsWalletBalance(credit)).toBe(true);
    expect(countsTowardsTotal(credit)).toBe(false);
  });
});

describe("isOverdue / isUpcoming", () => {
  const now = new Date(2026, 7, 16, 12, 0, 0);
  const past = new Date(2026, 7, 10).toISOString();
  const future = new Date(2026, 7, 20).toISOString();

  it("marks an unpaid past scheduled row overdue", () => {
    const t = txn({ type: TransactionSpecialType.upcoming, paid: false, dateCreated: past });
    expect(isOverdue(t, now)).toBe(true);
    expect(isUpcoming(t, now)).toBe(false);
  });

  it("marks an unpaid future scheduled row upcoming", () => {
    const t = txn({ type: TransactionSpecialType.upcoming, paid: false, dateCreated: future });
    expect(isUpcoming(t, now)).toBe(true);
    expect(isOverdue(t, now)).toBe(false);
  });

  it("treats neither as true once paid", () => {
    const t = txn({ type: TransactionSpecialType.upcoming, paid: true, dateCreated: past });
    expect(isOverdue(t, now)).toBe(false);
    expect(isUpcoming(t, now)).toBe(false);
  });

  it("ignores a skipped row", () => {
    const t = txn({
      type: TransactionSpecialType.upcoming,
      paid: false,
      skipPaid: true,
      dateCreated: past,
    });
    expect(isOverdue(t, now)).toBe(false);
  });

  it("never applies to a plain transaction", () => {
    expect(isOverdue(txn({ type: null, dateCreated: past }), now)).toBe(false);
  });

  it("is exhaustive: a scheduled unpaid row is exactly one of the two", () => {
    for (const dateCreated of [past, future]) {
      const t = txn({ type: TransactionSpecialType.upcoming, paid: false, dateCreated });
      expect(Number(isOverdue(t, now)) + Number(isUpcoming(t, now))).toBe(1);
    }
  });
});

describe("getWalletBalance", () => {
  it("sums only the named account", () => {
    const rows = [
      txn({ walletFk: "0", amount: 1000 }),
      txn({ walletFk: "0", amount: -250 }),
      txn({ walletFk: "1", amount: 9999 }),
    ];
    expect(getWalletBalance(rows, "0")).toBe(750);
  });

  it("ignores unpaid scheduled rows", () => {
    const rows = [
      txn({ walletFk: "0", amount: 1000 }),
      txn({ walletFk: "0", amount: -500, type: TransactionSpecialType.upcoming, paid: false }),
    ];
    expect(getWalletBalance(rows, "0")).toBe(1000);
  });

  it("includes a scheduled row once paid", () => {
    const rows = [
      txn({ walletFk: "0", amount: 1000 }),
      txn({ walletFk: "0", amount: -500, type: TransactionSpecialType.upcoming, paid: true }),
    ];
    expect(getWalletBalance(rows, "0")).toBe(500);
  });

  it("is zero for an account with no rows", () => {
    expect(getWalletBalance([], "0")).toBe(0);
  });

  it("includes transfers, which move real money", () => {
    // Excluded from *spending* totals, but they genuinely move the balance.
    const rows = [txn({ walletFk: "0", amount: -500, categoryFk: TRANSFER_CATEGORY_PK })];
    expect(getWalletBalance(rows, "0")).toBe(-500);
  });

  it("sums a long ledger without floating-point drift", () => {
    const rows = Array.from({ length: 300 }, () => txn({ walletFk: "0", amount: -0.1 }));
    expect(getWalletBalance(rows, "0")).toBeCloseTo(-30, 6);
  });
});

describe("getNetWorth", () => {
  /** A plain (non-credit-card) account. `accountType` 2 would be a card. */
  const wallet = (over: Partial<TransactionWallet> = {}): TransactionWallet =>
    ({
      walletPk: "0",
      name: "Savings",
      currency: "inr",
      accountType: 0,
      excludeFromNetWorth: false,
      dateTimeModified: null,
      ...over,
    }) as TransactionWallet;

  it("runs at all", () => {
    // Guards the circular-import fix. This function reached `credit.ts` through
    // a CommonJS `require()`, which only resolved because webpack rewrote it —
    // under plain ESM the call threw, so this assertion could not have passed
    // before the import was made static.
    const wallets = buildAllWallets([wallet()], "0", { inr: 1 });
    expect(() => getNetWorth(wallets, [])).not.toThrow();
  });

  it("sums account balances", () => {
    const wallets = buildAllWallets([wallet(), wallet({ walletPk: "1" })], "0", { inr: 1 });
    const rows = [
      txn({ walletFk: "0", amount: 5000 }),
      txn({ walletFk: "1", amount: 2500 }),
    ];
    expect(getNetWorth(wallets, rows)).toBeCloseTo(7500, 6);
  });

  it("skips accounts marked excluded from net worth", () => {
    const wallets = buildAllWallets(
      [wallet(), wallet({ walletPk: "1", excludeFromNetWorth: true })],
      "0",
      { inr: 1 },
    );
    const rows = [
      txn({ walletFk: "0", amount: 5000 }),
      txn({ walletFk: "1", amount: 9999 }),
    ];
    expect(getNetWorth(wallets, rows)).toBeCloseTo(5000, 6);
  });

  it("adds extra assets, which are not accounts", () => {
    const wallets = buildAllWallets([wallet()], "0", { inr: 1 });
    expect(getNetWorth(wallets, [txn({ walletFk: "0", amount: 1000 })], 250)).toBeCloseTo(1250, 6);
  });

  it("is the extra assets alone when there are no accounts", () => {
    expect(getNetWorth(buildAllWallets([], "0", { inr: 1 }), [], 400)).toBeCloseTo(400, 6);
  });
});
