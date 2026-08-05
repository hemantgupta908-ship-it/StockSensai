/**
 * Seed data and settings defaults, ported from Cashew's `defaultCategories.dart`
 * and `defaultPreferences.dart`.
 *
 * The category primary keys are the literal strings Cashew uses ("1".."11",
 * with "0" reserved for balance correction) so a CSV exported from Cashew
 * imports here with its categories already matched.
 */

import {
  AccountType,
  BALANCE_CORRECTION_CATEGORY_PK,
  DEFAULT_WALLET_PK,
  TRANSFER_CATEGORY_PK,
  HomePageWidgetDisplay,
  type TransactionCategory,
  type TransactionWallet,
} from "./types";

/**
 * The palette offered for categories, accounts, goals and policies.
 *
 * Ordered by hue so the swatch grid reads as a spectrum rather than a jumble,
 * with each hue in a normal and a deep tone. Every value is picked to stay
 * legible behind white iconography in both light and dark mode — the icon
 * badges draw white glyphs on these, so pale tints are deliberately absent.
 */
export const CATEGORY_COLOURS = [
  // Reds
  "#F44336", "#C62828", "#D32F2F", "#B71C1C",
  // Pinks → roses
  "#E91E63", "#AD1457", "#C2185B", "#880E4F",
  // Corals → salmons
  "#FF6B6B", "#E74C3C", "#FF5252",
  // Purples → magentas
  "#9C27B0", "#6A1B9A", "#8E24AA", "#4A148C",
  // Deep purples → violets
  "#673AB7", "#4527A0", "#512DA8", "#311B92",
  // Indigos
  "#3F51B5", "#283593", "#303F9F", "#1A237E",
  // Blues
  "#2196F3", "#1565C0", "#1976D2", "#0D47A1",
  // Sky blues → periwinkles
  "#03A9F4", "#0277BD", "#0288D1", "#4FC3F7",
  // Cyans → teals
  "#00BCD4", "#00838F", "#0097A7", "#006064",
  "#009688", "#00695C", "#00796B", "#004D40",
  // Greens
  "#4CAF50", "#2E7D32", "#388E3C", "#1B5E20",
  // Light greens → mints
  "#8BC34A", "#558B2F", "#689F38",
  // Limes → yellows
  "#CDDC39", "#9E9D24", "#AFB42B",
  // Ambers → golds
  "#FFC107", "#FF8F00", "#FFA000", "#FF6F00",
  // Oranges
  "#FF9800", "#EF6C00", "#F57C00", "#E65100",
  // Deep oranges
  "#FF5722", "#D84315", "#BF360C",
  // Browns → coppers
  "#795548", "#4E342E", "#5D4037", "#3E2723",
  // Blue-greys → slates
  "#607D8B", "#37474F", "#455A64", "#263238",
  // Neutrals
  "#9E9E9E", "#546E7A", "#78909C",
];

const now = () => new Date().toISOString();

/**
 * The 11 categories Cashew creates on first run, plus the reserved balance
 * correction category at pk "0".
 */
export function defaultCategories(): TransactionCategory[] {
  const base = {
    dateCreated: now(),
    dateTimeModified: null,
    emojiIconName: null,
    methodAdded: null,
    mainCategoryPk: null,
  };
  return [
    {
      ...base,
      categoryPk: BALANCE_CORRECTION_CATEGORY_PK,
      name: "Balance Correction",
      colour: "#9E9E9E",
      iconName: "scale",
      order: -2,
      income: false,
    },
    {
      ...base,
      categoryPk: TRANSFER_CATEGORY_PK,
      name: "Transfer",
      colour: "#78909C",
      iconName: "arrow-left-right",
      order: -1,
      income: false,
    },
    { ...base, categoryPk: "1", name: "Dining", colour: "#607D8B", iconName: "utensils", order: 0, income: false },
    { ...base, categoryPk: "2", name: "Groceries", colour: "#4CAF50", iconName: "shopping-basket", order: 1, income: false },
    { ...base, categoryPk: "3", name: "Shopping", colour: "#E91E63", iconName: "shopping-bag", order: 2, income: false },
    { ...base, categoryPk: "4", name: "Transit", colour: "#FFC107", iconName: "train", order: 3, income: false },
    { ...base, categoryPk: "5", name: "Entertainment", colour: "#2196F3", iconName: "popcorn", order: 4, income: false },
    { ...base, categoryPk: "6", name: "Bills & Fees", colour: "#4CAF50", iconName: "receipt", order: 5, income: false },
    { ...base, categoryPk: "7", name: "Gifts", colour: "#F44336", iconName: "gift", order: 6, income: false },
    { ...base, categoryPk: "8", name: "Beauty", colour: "#9C27B0", iconName: "flower", order: 8, income: false },
    { ...base, categoryPk: "9", name: "Work", colour: "#795548", iconName: "briefcase", order: 9, income: false },
    { ...base, categoryPk: "10", name: "Travel", colour: "#FF9800", iconName: "plane", order: 10, income: false },
    { ...base, categoryPk: "11", name: "Income", colour: "#B39DDB", iconName: "coins", order: 11, income: true },
  ];
}

/** The single account created at onboarding. Defaults to INR for this app. */
export function defaultWallets(currency = "inr"): TransactionWallet[] {
  return [
    {
      walletPk: DEFAULT_WALLET_PK,
      name: "Bank",
      colour: null,
      iconName: null,
      dateCreated: now(),
      dateTimeModified: null,
      order: 0,
      currency,
      currencyFormat: null,
      decimals: 2,
      homePageWidgetDisplay: [HomePageWidgetDisplay.WalletSwitcher],
      accountType: AccountType.bank,
      creditLimit: null,
      statementDay: null,
      dueDay: null,
    },
  ];
}

/**
 * Budget-environment settings.
 *
 * Deliberately its own namespace: none of this is shared with the stock side of
 * the app, so the two environments can be themed and configured independently.
 */
export interface BudgetSettings {
  // Appearance
  theme: "system" | "light" | "dark";
  accentColour: string;
  materialYou: boolean;
  outlinedIcons: boolean;
  animatedBudgetBackground: boolean;
  font: string;
  batterySaver: boolean;

  // Money
  primaryWalletPk: string;
  exchangeRates: Record<string, number>;
  /** Show the account name next to every transaction. */
  accountLabel: boolean;
  currencyLabel: boolean;
  /** Show cents/paise. */
  showDecimals: boolean;

  // Entry flow
  askForTransactionTitle: boolean;
  askForNotesWithTitle: boolean;
  autoAddTitles: boolean;
  showBalanceTransferTab: boolean;
  /** Mark past-due upcoming/subscription rows paid without asking. */
  autoPayUpcoming: boolean;
  autoPaySubscriptions: boolean;
  defaultStartOfWeek: number;

  // Home page widgets, in display order.
  homePageOrder: string[];
  homePageHidden: string[];
  showPinnedBudgets: boolean;
  showObjectives: boolean;
  showUpcomingTransactions: boolean;
  showCreditDebt: boolean;
  showPolicies: boolean;
  showNetWorth: boolean;
  showPieChart: boolean;
  showLineGraph: boolean;
  showHeatmap: boolean;
  showAllSpendingSummary: boolean;
  showWalletSwitcher: boolean;

  // Lists
  transactionsGroupedByDay: boolean;
  showTransactionSearch: boolean;
  sortTransactions: "date-newest" | "date-oldest" | "amount-highest" | "amount-lowest";

  // Privacy
  requirePin: boolean;
  pinHash: string | null;
  /** Blur amounts until tapped. */
  hideAmounts: boolean;

  // Notifications (browser-local reminders)
  dailyReminderEnabled: boolean;
  dailyReminderTime: string;
  upcomingRemindersEnabled: boolean;

  username: string;
  onboardingComplete: boolean;
}

export const DEFAULT_BUDGET_SETTINGS: BudgetSettings = {
  theme: "system",
  accentColour: "#007AFF",
  materialYou: false,
  outlinedIcons: false,
  animatedBudgetBackground: true,
  font: "system",
  batterySaver: false,

  primaryWalletPk: DEFAULT_WALLET_PK,
  exchangeRates: {},
  accountLabel: false,
  currencyLabel: false,
  showDecimals: true,

  askForTransactionTitle: true,
  askForNotesWithTitle: false,
  autoAddTitles: true,
  showBalanceTransferTab: true,
  autoPayUpcoming: false,
  autoPaySubscriptions: false,
  defaultStartOfWeek: 1,

  homePageOrder: [
    "walletSwitcher",
    "netWorth",
    "allSpendingSummary",
    "budgets",
    "objectives",
    "upcoming",
    "creditDebt",
    "pieChart",
    "lineGraph",
    "heatmap",
    "transactions",
  ],
  homePageHidden: [],
  showPinnedBudgets: true,
  showObjectives: true,
  showUpcomingTransactions: true,
  showCreditDebt: true,
  showPolicies: true,
  showNetWorth: true,
  showPieChart: true,
  showLineGraph: true,
  showHeatmap: true,
  showAllSpendingSummary: true,
  showWalletSwitcher: true,

  transactionsGroupedByDay: true,
  showTransactionSearch: true,
  sortTransactions: "date-newest",

  requirePin: false,
  pinHash: null,
  hideAmounts: false,

  dailyReminderEnabled: false,
  dailyReminderTime: "20:00",
  upcomingRemindersEnabled: true,

  username: "",
  onboardingComplete: false,
};

/** Names Cashew suggests when creating budgets/goals/loans. */
export const EXAMPLE_BUDGET_NAMES = ["Monthly Spending", "Vacation"];
export const EXAMPLE_GOAL_NAMES = ["Trip Savings Jar", "Car Loan Payment"];
