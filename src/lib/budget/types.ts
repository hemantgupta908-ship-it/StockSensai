/**
 * Cashew data model, ported 1:1.
 *
 * Cashew (github.com/jameskokoska/Cashew) persists enums as their *declaration
 * index*, so the order of every enum below is load-bearing — reordering a
 * member silently reinterprets existing data. The indices here match the Dart
 * source at schema version 46.
 *
 * Field names deliberately keep Cashew's `...Pk` / `...Fk` convention so that
 * the calculation ports read the same as the originals and CSV round-trips
 * against Cashew's own export stay honest.
 */

// ---------------------------------------------------------------------------
// Enums — order is the wire format. Do not reorder.
// ---------------------------------------------------------------------------

/** How a budget (or a repeating transaction) rolls over. */
export enum BudgetReoccurence {
  custom = 0,
  daily = 1,
  weekly = 2,
  monthly = 3,
  yearly = 4,
}

/**
 * Transactions that are not plain settled spending.
 *
 * `upcoming`/`subscription`/`repetitive` do not count toward totals until they
 * are marked paid; `credit`/`debt` are lent/borrowed money.
 */
export enum TransactionSpecialType {
  upcoming = 0,
  subscription = 1,
  repetitive = 2,
  credit = 3,
  debt = 4,
}

/** An Objective is either a savings/spending goal or a loan. */
export enum ObjectiveType {
  goal = 0,
  loan = 1,
}

export enum SharedOwnerMember {
  owner = 0,
  member = 1,
}

export enum ExpenseIncome {
  income = 0,
  expense = 1,
}

export enum PaidStatus {
  paid = 0,
  notPaid = 1,
  skipped = 2,
}

/**
 * Opt-in widenings of a budget's transaction set.
 *
 * Note `defaultBudgetTransactionFilters` sits at index 5 in Cashew's enum even
 * though it is a sentinel rather than a real filter, and
 * `includeBalanceCorrection` follows it at 6.
 */
export enum BudgetTransactionFilters {
  addedToOtherBudget = 0,
  sharedToOtherBudget = 1,
  includeIncome = 2,
  includeDebtAndCredit = 3,
  addedToObjective = 4,
  defaultBudgetTransactionFilters = 5,
  includeBalanceCorrection = 6,
}

/** Which summary widget an account shows on the home page. */
export enum HomePageWidgetDisplay {
  WalletSwitcher = 0,
  WalletList = 1,
  NetWorth = 2,
  AllSpendingSummary = 3,
  PieChart = 4,
}

export enum ThemeSetting {
  dark = 0,
  light = 1,
}

/** Provenance of a record, used to explain rows the user did not type in. */
export enum MethodAdded {
  email = 0,
  shared = 1,
  csv = 2,
  preview = 3,
  appLink = 4,
}

export enum SharedStatus {
  waiting = 0,
  shared = 1,
  error = 2,
}

export enum DeleteLogType {
  TransactionWallet = 0,
  TransactionCategory = 1,
  Budget = 2,
  CategoryBudgetLimit = 3,
  Transaction = 4,
  TransactionAssociatedTitle = 5,
  ScannerTemplate = 6,
  Objective = 7,
  Unused = 8,
  /** Extension beyond Cashew; appended so existing indices are untouched. */
  Policy = 9,
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/**
 * An account. Cashew calls these "wallets" internally and "accounts" in the UI;
 * the internal name is kept so ported calculations line up.
 */
export interface TransactionWallet {
  walletPk: string;
  name: string;
  colour: string | null;
  iconName: string | null;
  dateCreated: string;
  dateTimeModified: string | null;
  order: number;
  currency: string | null;
  currencyFormat: string | null;
  /** Display precision. Cashew allows 0 for currencies like JPY. */
  decimals: number;
  homePageWidgetDisplay: HomePageWidgetDisplay[] | null;

  // --- Extensions beyond Cashew -------------------------------------------
  // Cashew treats every account identically. A credit card behaves differently
  // enough — it carries a limit, a billing cycle and a due date — that it needs
  // its own fields. All are nullable, so a Cashew export still round-trips and
  // an account without them behaves exactly as before.

  /** Null is treated as `bank`, so existing accounts are unaffected. */
  accountType: AccountType | null;
  /** Credit cards only: the sanctioned limit, used for utilisation. */
  creditLimit: number | null;
  /** Credit cards only: day of month the statement is generated (1–28). */
  statementDay: number | null;
  /** Credit cards only: day of month payment is due (1–28). */
  dueDay: number | null;
}

/**
 * What an account represents.
 *
 * Purely presentational except for `creditCard`, which unlocks the limit,
 * utilisation and billing-cycle calculations.
 */
export enum AccountType {
  bank = 0,
  cash = 1,
  creditCard = 2,
  wallet = 3,
  investment = 4,
}

export interface Transaction {
  transactionPk: string;
  /** Set on both halves of a balance transfer so they can be edited together. */
  pairedTransactionFk: string | null;
  name: string;
  amount: number;
  note: string;
  categoryFk: string;
  subCategoryFk: string | null;
  walletFk: string;
  /** Cashew treats this as the transaction's *date*, not its insertion time. */
  dateCreated: string;
  dateTimeModified: string | null;
  originalDateDue: string | null;
  income: boolean;
  periodLength: number | null;
  reoccurrence: BudgetReoccurence | null;
  endDate: string | null;
  upcomingTransactionNotification: boolean | null;
  type: TransactionSpecialType | null;
  paid: boolean;
  /** Guards against a repeating transaction spawning its successor twice. */
  createdAnotherFutureTransaction: boolean | null;
  skipPaid: boolean;
  methodAdded: MethodAdded | null;
  transactionOwnerEmail: string | null;
  transactionOriginalOwnerEmail: string | null;
  sharedKey: string | null;
  sharedOldKey: string | null;
  sharedStatus: SharedStatus | null;
  sharedDateUpdated: string | null;
  sharedReferenceBudgetPk: string | null;
  /** Goal this transaction contributes to. */
  objectiveFk: string | null;
  /** Loan this transaction contributes to. Separate column from `objectiveFk`. */
  objectiveLoanFk: string | null;
  budgetFksExclude: string[] | null;
}

export interface TransactionCategory {
  categoryPk: string;
  name: string;
  colour: string | null;
  iconName: string | null;
  emojiIconName: string | null;
  dateCreated: string;
  dateTimeModified: string | null;
  order: number;
  income: boolean;
  methodAdded: MethodAdded | null;
  /** Non-null makes this a subcategory of the referenced category. */
  mainCategoryPk: string | null;
}

export interface CategoryBudgetLimit {
  categoryLimitPk: string;
  categoryFk: string;
  budgetFk: string;
  amount: number;
  dateTimeModified: string | null;
  walletFk: string;
}

/** Remembers "this transaction name means this category" for autocomplete. */
export interface TransactionAssociatedTitle {
  associatedTitlePk: string;
  categoryFk: string;
  title: string;
  dateCreated: string;
  dateTimeModified: string | null;
  order: number;
  isExactMatch: boolean;
}

export interface Budget {
  budgetPk: string;
  name: string;
  amount: number;
  colour: string | null;
  startDate: string;
  endDate: string;
  walletFks: string[] | null;
  categoryFks: string[] | null;
  categoryFksExclude: string[] | null;
  /** A "savings budget" — budgets income rather than spending. */
  income: boolean;
  archived: boolean;
  /** Only counts transactions explicitly added to this budget. */
  addedTransactionsOnly: boolean;
  periodLength: number;
  reoccurrence: BudgetReoccurence | null;
  dateCreated: string;
  dateTimeModified: string | null;
  pinned: boolean;
  order: number;
  walletFk: string;
  budgetTransactionFilters: BudgetTransactionFilters[] | null;
  memberTransactionFilters: string[] | null;
  sharedKey: string | null;
  sharedOwnerMember: SharedOwnerMember | null;
  sharedDateUpdated: string | null;
  sharedMembers: string[] | null;
  sharedAllMembersEver: string[] | null;
  /** Category limits act as hard caps rather than shares of the total. */
  isAbsoluteSpendingLimit: boolean;
}

export interface Objective {
  objectivePk: string;
  type: ObjectiveType;
  name: string;
  amount: number;
  order: number;
  colour: string | null;
  dateCreated: string;
  endDate: string | null;
  dateTimeModified: string | null;
  iconName: string | null;
  emojiIconName: string | null;
  income: boolean;
  pinned: boolean;
  archived: boolean;
  walletFk: string;
}

/** Rule for turning an incoming message/notification into a transaction. */
export interface ScannerTemplate {
  scannerTemplatePk: string;
  dateCreated: string;
  dateTimeModified: string | null;
  templateName: string;
  contains: string;
  titleTransactionBefore: string;
  titleTransactionAfter: string;
  amountTransactionBefore: string;
  amountTransactionAfter: string;
  defaultCategoryFk: string;
  walletFk: string;
  ignore: boolean;
}

// ---------------------------------------------------------------------------
// Policies — extension beyond Cashew
// ---------------------------------------------------------------------------

/**
 * A long-running financial commitment: LIC and other insurance, SIPs, PPF,
 * recurring deposits, fixed deposits.
 *
 * Cashew has no equivalent. These do not fit its existing shapes: a subscription
 * models the *outgoing premium* but forgets the policy behind it, and a goal
 * models a *target* but not a schedule, a provider, or a maturity value. A
 * policy is both — a recurring obligation and an accumulating asset — so it
 * gets its own record and links to the transactions that pay it.
 */
export interface Policy {
  policyPk: string;
  type: PolicyType;
  name: string;
  /** LIC, HDFC Life, SBI, ... */
  provider: string;
  /** Policy / folio / account number. Free text — never validated. */
  policyNumber: string;

  /** Amount due each period. */
  premiumAmount: number;
  premiumFrequency: PremiumFrequency;
  /** When the policy started; premiums are counted from here. */
  startDate: string;
  /** Next premium due. Advances as premiums are recorded. */
  nextDueDate: string | null;
  /** When the policy pays out or ends. Null for open-ended commitments. */
  maturityDate: string | null;

  /** Death benefit for insurance; null for investment products. */
  sumAssured: number | null;
  /** Expected value at maturity, where the product projects one. */
  maturityValue: number | null;

  /** Account the premium is paid from. */
  walletFk: string;
  /** Category premiums are booked under. */
  categoryFk: string | null;

  colour: string | null;
  note: string;
  /** Kept for the record but no longer active. */
  archived: boolean;
  /** Surface on the budget home screen. */
  pinned: boolean;

  dateCreated: string;
  dateTimeModified: string | null;
}

export enum PolicyType {
  lifeInsurance = 0,
  healthInsurance = 1,
  termInsurance = 2,
  sip = 3,
  ppf = 4,
  recurringDeposit = 5,
  fixedDeposit = 6,
  nps = 7,
  other = 8,
}

export enum PremiumFrequency {
  monthly = 0,
  quarterly = 1,
  halfYearly = 2,
  yearly = 3,
  /** Single-premium products: paid once, no recurring due date. */
  oneTime = 4,
}

/** Human labels, and how many premiums a year each frequency implies. */
export const PREMIUM_FREQUENCY_META: Record<
  PremiumFrequency,
  { label: string; perYear: number; monthsBetween: number }
> = {
  [PremiumFrequency.monthly]: { label: "Monthly", perYear: 12, monthsBetween: 1 },
  [PremiumFrequency.quarterly]: { label: "Quarterly", perYear: 4, monthsBetween: 3 },
  [PremiumFrequency.halfYearly]: { label: "Half-yearly", perYear: 2, monthsBetween: 6 },
  [PremiumFrequency.yearly]: { label: "Yearly", perYear: 1, monthsBetween: 12 },
  [PremiumFrequency.oneTime]: { label: "One time", perYear: 0, monthsBetween: 0 },
};

export const POLICY_TYPE_META: Record<PolicyType, { label: string; group: "insurance" | "investment" }> = {
  [PolicyType.lifeInsurance]: { label: "Life insurance", group: "insurance" },
  [PolicyType.healthInsurance]: { label: "Health insurance", group: "insurance" },
  [PolicyType.termInsurance]: { label: "Term insurance", group: "insurance" },
  [PolicyType.sip]: { label: "SIP / Mutual fund", group: "investment" },
  [PolicyType.ppf]: { label: "PPF", group: "investment" },
  [PolicyType.recurringDeposit]: { label: "Recurring deposit", group: "investment" },
  [PolicyType.fixedDeposit]: { label: "Fixed deposit", group: "investment" },
  [PolicyType.nps]: { label: "NPS", group: "investment" },
  [PolicyType.other]: { label: "Other", group: "investment" },
};

/** Tombstone so a delete propagates instead of being resurrected by a sync. */
export interface DeleteLog {
  deleteLogPk: string;
  entryPk: string;
  type: DeleteLogType;
  dateTimeModified: string;
}

// ---------------------------------------------------------------------------
// Reserved primary keys
// ---------------------------------------------------------------------------

/**
 * Reserved primary keys.
 *
 * `"0"` is Cashew's balance-correction category and wallet `"0"` is the first
 * account created at onboarding.
 *
 * `"-1"` is **not** from Cashew. Cashew files account transfers under balance
 * correction too, which conflates two genuinely different actions: a transfer
 * moves money you already have between your own accounts, whereas a correction
 * invents or destroys money to make a balance match reality. Reconciling a
 * mis-typed balance and moving ₹5,000 from bank to wallet should not read as
 * the same line in your history, so transfers get their own reserved category.
 *
 * Both are excluded from income/expense totals — see `isExcludedFromTotals`.
 */
export const BALANCE_CORRECTION_CATEGORY_PK = "0";
export const TRANSFER_CATEGORY_PK = "-1";
export const DEFAULT_WALLET_PK = "0";

/** Categories that move balances without counting as income or expense. */
export const RESERVED_CATEGORY_PKS = [
  BALANCE_CORRECTION_CATEGORY_PK,
  TRANSFER_CATEGORY_PK,
] as const;

/** The whole dataset, as persisted. */
export interface BudgetDatabase {
  wallets: TransactionWallet[];
  transactions: Transaction[];
  categories: TransactionCategory[];
  categoryBudgetLimits: CategoryBudgetLimit[];
  associatedTitles: TransactionAssociatedTitle[];
  budgets: Budget[];
  objectives: Objective[];
  scannerTemplates: ScannerTemplate[];
  /** Extension beyond Cashew — see `Policy`. */
  policies: Policy[];
  deleteLogs: DeleteLog[];
}
