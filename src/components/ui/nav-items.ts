import {
  ArrowsLeftRight,
  CalendarBlank,
  CalendarCheck,
  ChartLineUp,
  ChartPie,
  Flag,
  Gear,
  House,
  Star,
  Wallet,
} from "@phosphor-icons/react";

import type { NavItem, NavSection } from "./nav";

/**
 * The screened-ideas feed, which exists on the web only.
 *
 * Google Play reviews apps that surface stock buy/sell recommendations to an
 * Indian audience against a SEBI registration requirement, and this app is
 * explicitly not registered — the disclaimer says so. So the Android build
 * ships without the feed, without the price levels on a signal, and without
 * the portfolio's take-profit/average-down prompts; it keeps live prices,
 * charts, fundamentals, the watchlist, portfolio tracking and the strategy
 * explainers, none of which recommend a trade.
 *
 * The check is written inline rather than imported from `@/lib/mobile/config`
 * on purpose: Next substitutes a literal for `process.env.NEXT_PUBLIC_MOBILE`
 * at build time, so a module-local `const` folds and the minifier drops the
 * entry entirely. An imported `IS_MOBILE` crosses a module boundary, survives
 * minification, and leaves the strings sitting in the APK — hidden at runtime
 * but still shipped, which is not the same guarantee.
 */
const WEB_ONLY = process.env.NEXT_PUBLIC_MOBILE !== "1";

const RECOMMENDATIONS_ITEM: NavItem = {
  href: "/home",
  label: "Stock Recommendations",
  description: "Today's screened ideas",
  icon: ChartLineUp,
};

/** Also web-only, and for the same reason. */
const WATCHLIST_ITEM: NavItem = {
  href: "/watchlist",
  label: "Watchlist",
  description: "Stocks you're following",
  icon: Star,
};

/**
 * Every destination in the product, in one list.
 *
 * There used to be two manifests behind an environment switcher — one for
 * stocks, one for budget — and crossing between them meant changing app. They
 * are one product: what you own, what you spend, what you're researching.
 *
 * Two overview entries rather than one is a deliberate interim state. `/home`
 * is still the screens feed and `/budget` still the money dashboard; a single
 * unified dashboard replaces both later, at which point these collapse into it.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        href: "/budget",
        label: "Home",
        description: "Balances and spending",
        icon: House,
        exact: true,
      },
      ...(WEB_ONLY ? [RECOMMENDATIONS_ITEM] : []),
    ],
  },
  {
    title: "Investing",
    items: [
      ...(WEB_ONLY ? [WATCHLIST_ITEM] : []),
      { href: "/portfolio", label: "Portfolio", description: "Plan versus what you did", icon: Wallet },
    ],
  },
  {
    title: "Spending",
    items: [
      {
        href: "/budget/transactions",
        label: "Transactions",
        description: "Everything you've recorded",
        icon: ArrowsLeftRight,
      },
      {
        href: "/budget/calendar",
        label: "Calendar",
        description: "Monthly day-by-day view",
        icon: CalendarBlank,
      },
      {
        href: "/budget/budgets",
        label: "Budgets",
        description: "Spending limits by period",
        icon: ChartPie,
      },
    ],
  },
  {
    title: "Planning",
    items: [
      {
        href: "/budget/planning",
        label: "Planning",
        description: "Goals, loans, policies & subscriptions",
        icon: Flag,
      },
      {
        href: "/budget/upcoming",
        label: "Upcoming & Overdue",
        description: "Unpaid scheduled transactions",
        icon: CalendarCheck,
      },
    ],
  },
  {
    title: "Organise",
    items: [
      { href: "/settings", label: "Settings", description: "Appearance, risk, account, budget", icon: Gear },
    ],
  },
];

/**
 * The handful that get a bottom tab on mobile.
 *
 * Twenty destinations do not fit across a phone; these are the ones worth a
 * thumb. Everything else is one tap away behind "More", which lists the
 * sections above in full.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/budget", label: "Home", description: "Balances and spending", icon: House, exact: true },
  {
    href: "/budget/transactions",
    label: "Transactions",
    description: "Everything you've recorded",
    icon: ArrowsLeftRight,
  },
  { href: "/portfolio", label: "Portfolio", description: "Plan versus what you did", icon: Wallet },
  // The fourth slot is the feed on the web, and Planning on Android, which has
  // neither the feed nor the watchlist to tab to (see RECOMMENDATIONS_ITEM).
  // Goals, loans, policies and subscriptions are the money screens people
  // actually return to; the strategy explainers that used to sit here are
  // reference material, and keep their entry in Settings.
  WEB_ONLY
    ? { ...RECOMMENDATIONS_ITEM, label: "Recom." }
    : {
        href: "/budget/planning",
        label: "Planning",
        description: "Goals, loans, policies & subscriptions",
        icon: Flag,
      },
  { href: "/settings", label: "Settings", description: "Appearance, risk, account, budget", icon: Gear },
];
