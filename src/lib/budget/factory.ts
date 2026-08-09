/**
 * Constructors for new records.
 *
 * Every row in the Cashew schema has a long tail of nullable sync/sharing
 * columns. Centralising the defaults here keeps call sites readable and stops
 * a forgotten field from silently changing how a calculation reads a row.
 */

import {
  AccountType,
  BudgetReoccurence,
  BudgetTransactionFilters,
  ObjectiveType,
  PolicyType,
  PremiumFrequency,
  TransactionSpecialType,
  DEFAULT_WALLET_PK,
  type Budget,
  type CategoryBudgetLimit,
  type Objective,
  type Policy,
  type Transaction,
  type TransactionAssociatedTitle,
  type TransactionCategory,
  type TransactionWallet,
} from "./types";

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createTransaction(over: Partial<Transaction> = {}): Transaction {
  const iso = new Date().toISOString();
  return {
    transactionPk: newId(),
    pairedTransactionFk: null,
    name: "",
    amount: 0,
    note: "",
    categoryFk: "1",
    subCategoryFk: null,
    walletFk: DEFAULT_WALLET_PK,
    dateCreated: iso,
    dateTimeModified: iso,
    originalDateDue: null,
    income: false,
    periodLength: null,
    reoccurrence: null,
    endDate: null,
    upcomingTransactionNotification: true,
    type: null,
    // A plain transaction has already happened; scheduled types override this.
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
    ...over,
  };
}

export function createCategory(over: Partial<TransactionCategory> = {}): TransactionCategory {
  const iso = new Date().toISOString();
  return {
    categoryPk: newId(),
    name: "",
    colour: "#607D8B",
    iconName: null,
    emojiIconName: null,
    dateCreated: iso,
    dateTimeModified: iso,
    order: 0,
    income: false,
    methodAdded: null,
    mainCategoryPk: null,
    ...over,
  };
}

export function createWallet(over: Partial<TransactionWallet> = {}): TransactionWallet {
  const iso = new Date().toISOString();
  return {
    walletPk: newId(),
    name: "",
    colour: null,
    iconName: null,
    dateCreated: iso,
    dateTimeModified: iso,
    order: 0,
    currency: "inr",
    currencyFormat: null,
    decimals: 2,
    homePageWidgetDisplay: null,
    accountType: AccountType.bank,
    creditLimit: null,
    statementDay: null,
    dueDay: null,
    ...over,
  };
}

/**
 * A new policy. Defaults to a monthly life-insurance premium, the most common
 * case here, with the first due date one period out from today.
 */
export function createPolicy(over: Partial<Policy> = {}): Policy {
  const iso = new Date().toISOString();
  const today = new Date();
  return {
    policyPk: newId(),
    type: PolicyType.lifeInsurance,
    name: "",
    provider: "",
    policyNumber: "",
    premiumAmount: 0,
    premiumFrequency: PremiumFrequency.monthly,
    startDate: iso,
    nextDueDate: new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      today.getDate(),
      12,
    ).toISOString(),
    maturityDate: null,
    sumAssured: null,
    maturityValue: null,
    walletFk: DEFAULT_WALLET_PK,
    categoryFk: null,
    colour: null,
    note: "",
    archived: false,
    pinned: true,
    dateCreated: iso,
    dateTimeModified: iso,
    ...over,
  };
}

/**
 * The transaction that records paying a premium.
 *
 * The policy tag lives in the note rather than a dedicated column so that
 * transactions stay shape-compatible with Cashew's export. `scheduled` writes
 * it as an upcoming (unpaid) row instead of a settled one.
 */
export function createPremiumTransaction(
  policy: Policy,
  opts: { date: Date; amount?: number; scheduled?: boolean } = { date: new Date() },
): Transaction {
  const tag = `policy:${policy.policyPk}`;
  const magnitude = Math.abs(opts.amount ?? policy.premiumAmount);
  return createTransaction({
    name: `${policy.name} premium`,
    amount: -magnitude,
    income: false,
    note: policy.note ? `${policy.note} ${tag}` : tag,
    categoryFk: policy.categoryFk ?? "6", // Bills & Fees
    walletFk: policy.walletFk,
    dateCreated: opts.date.toISOString(),
    originalDateDue: opts.date.toISOString(),
    type: opts.scheduled ? TransactionSpecialType.upcoming : null,
    paid: !opts.scheduled,
  });
}

/**
 * A monthly spending budget — Cashew's default shape.
 *
 * `startDate` is normalised to midnight because the period search compares
 * against it directly.
 */
export function createBudget(over: Partial<Budget> = {}): Budget {
  const iso = new Date().toISOString();
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    budgetPk: newId(),
    name: "",
    amount: 0,
    colour: null,
    startDate: start.toISOString(),
    endDate: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString(),
    walletFks: null,
    categoryFks: null,
    categoryFksExclude: null,
    income: false,
    archived: false,
    addedTransactionsOnly: false,
    periodLength: 1,
    reoccurrence: BudgetReoccurence.monthly,
    dateCreated: iso,
    dateTimeModified: iso,
    pinned: true,
    order: 0,
    walletFk: DEFAULT_WALLET_PK,
    budgetTransactionFilters: [BudgetTransactionFilters.defaultBudgetTransactionFilters],
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

export function createObjective(over: Partial<Objective> = {}): Objective {
  const iso = new Date().toISOString();
  return {
    objectivePk: newId(),
    type: ObjectiveType.goal,
    name: "",
    amount: 0,
    order: 0,
    colour: null,
    dateCreated: iso,
    endDate: null,
    dateTimeModified: iso,
    iconName: null,
    emojiIconName: null,
    income: true,
    pinned: true,
    archived: false,
    walletFk: DEFAULT_WALLET_PK,
    paymentDayOfMonth: null,
    ...over,
  };
}

export function createCategoryLimit(over: Partial<CategoryBudgetLimit> = {}): CategoryBudgetLimit {
  return {
    categoryLimitPk: newId(),
    categoryFk: "",
    budgetFk: "",
    amount: 0,
    dateTimeModified: new Date().toISOString(),
    walletFk: DEFAULT_WALLET_PK,
    ...over,
  };
}

export function createAssociatedTitle(
  over: Partial<TransactionAssociatedTitle> = {},
): TransactionAssociatedTitle {
  const iso = new Date().toISOString();
  return {
    associatedTitlePk: newId(),
    categoryFk: "",
    title: "",
    dateCreated: iso,
    dateTimeModified: iso,
    order: 0,
    isExactMatch: false,
    ...over,
  };
}

/**
 * Best category for a transaction name, from the associated-titles table.
 *
 * Exact-match titles win over substring matches; among substring matches the
 * longest title wins, so "Coffee Shop" beats a bare "Coffee".
 */
export function matchAssociatedTitle(
  name: string,
  titles: TransactionAssociatedTitle[],
): TransactionAssociatedTitle | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;

  const exact = titles.find((t) => t.isExactMatch && t.title.trim().toLowerCase() === needle);
  if (exact) return exact;

  const partial = titles
    .filter((t) => !t.isExactMatch && needle.includes(t.title.trim().toLowerCase()))
    .sort((a, b) => b.title.length - a.title.length);

  return partial[0] ?? null;
}
