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
export interface ColourFamily {
  name: string;
  /** Light → dark. The middle entry is the family's representative swatch. */
  shades: string[];
}

/**
 * The colour palette, grouped by hue.
 *
 * Grouped rather than a flat list because a flat list forced the picker to show
 * an arbitrary prefix of it — which meant every swatch on offer was a red, pink
 * or purple while two thirds of the palette was unreachable. Each family runs
 * light to dark so picking a *hue* and picking a *shade* are separate choices.
 */
export const COLOUR_FAMILIES: ColourFamily[] = [
  { name: "Red", shades: ["#EF9A9A", "#E57373", "#F44336", "#D32F2F", "#B71C1C"] },
  { name: "Coral", shades: ["#FFAB91", "#FF8A65", "#FF6B6B", "#E74C3C", "#BF360C"] },
  { name: "Pink", shades: ["#F48FB1", "#F06292", "#E91E63", "#C2185B", "#880E4F"] },
  { name: "Purple", shades: ["#CE93D8", "#BA68C8", "#9C27B0", "#7B1FA2", "#4A148C"] },
  { name: "Violet", shades: ["#B39DDB", "#9575CD", "#673AB7", "#512DA8", "#311B92"] },
  { name: "Indigo", shades: ["#9FA8DA", "#7986CB", "#3F51B5", "#303F9F", "#1A237E"] },
  { name: "Blue", shades: ["#90CAF9", "#64B5F6", "#2196F3", "#1976D2", "#0D47A1"] },
  { name: "Sky", shades: ["#81D4FA", "#4FC3F7", "#03A9F4", "#0288D1", "#01579B"] },
  { name: "Cyan", shades: ["#80DEEA", "#4DD0E1", "#00BCD4", "#0097A7", "#006064"] },
  { name: "Teal", shades: ["#80CBC4", "#4DB6AC", "#009688", "#00796B", "#004D40"] },
  { name: "Green", shades: ["#A5D6A7", "#81C784", "#4CAF50", "#388E3C", "#1B5E20"] },
  { name: "Lime", shades: ["#C5E1A5", "#AED581", "#8BC34A", "#689F38", "#33691E"] },
  { name: "Yellow", shades: ["#E6EE9C", "#DCE775", "#CDDC39", "#AFB42B", "#827717"] },
  { name: "Amber", shades: ["#FFE082", "#FFD54F", "#FFC107", "#FFA000", "#FF6F00"] },
  { name: "Orange", shades: ["#FFCC80", "#FFB74D", "#FF9800", "#F57C00", "#E65100"] },
  { name: "Rust", shades: ["#FFAB91", "#FF8A65", "#FF5722", "#D84315", "#BF360C"] },
  { name: "Brown", shades: ["#BCAAA4", "#A1887F", "#795548", "#5D4037", "#3E2723"] },
  { name: "Slate", shades: ["#B0BEC5", "#90A4AE", "#607D8B", "#455A64", "#263238"] },
  { name: "Grey", shades: ["#E0E0E0", "#BDBDBD", "#9E9E9E", "#757575", "#424242"] },
];

/** The swatch that represents each family in the hue row. */
export const COLOUR_FAMILY_INDEX = 2;

/** Flat palette, kept for callers that just want the whole list. */
export const CATEGORY_COLOURS = COLOUR_FAMILIES.flatMap((f) => f.shades);

/**
 * Named rather than `CATEGORY_COLOURS[0]`: the flat list now starts at the
 * lightest red, which is too pale to be a sensible default for a new category.
 */
export const DEFAULT_CATEGORY_COLOUR = COLOUR_FAMILIES[0].shades[COLOUR_FAMILY_INDEX];

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
