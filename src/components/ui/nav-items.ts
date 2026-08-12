import {
  ArrowsLeftRight,
  BookOpen,
  CalendarBlank,
  CalendarCheck,
  ChartLineUp,
  ChartPie,
  CreditCard,
  Flag,
  Gear,
  House,
  Repeat,
  ShieldCheck,
  Stack,
  Star,
  Wallet,
} from "@phosphor-icons/react";

import type { NavItem, NavSection } from "./nav";

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
      { href: "/home", label: "Stock Recommendations", description: "Today's screened ideas", icon: ChartLineUp },
    ],
  },
  {
    title: "Investing",
    items: [
      { href: "/watchlist", label: "Watchlist", description: "Stocks you're following", icon: Star },
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
 * The five that get a bottom tab on mobile.
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
  { href: "/home", label: "Recom.", description: "Today's screened ideas", icon: ChartLineUp },
  { href: "/settings", label: "Settings", description: "Appearance, risk, account, budget", icon: Gear },
];
