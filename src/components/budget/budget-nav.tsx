"use client";

/**
 * Navigation for the budget environment.
 *
 * Deliberately separate from the stock app's `NAV_ITEMS`: the two environments
 * share a codebase and an auth session but nothing else, so each gets its own
 * tab bar, sidebar and settings. The environment switcher at the top of the
 * sidebar (and in the budget header on mobile) is the only crossing point.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeftRight,
  CalendarClock,
  CreditCard,
  Flag,
  Home,
  LayoutGrid,
  PieChart,
  Repeat,
  Settings,
  Shapes,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { EnvironmentSwitcher } from "@/components/ui/environment-switcher";

export interface BudgetNavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

/** The five destinations that get a bottom tab on mobile. */
export const BUDGET_TAB_ITEMS: BudgetNavItem[] = [
  { href: "/budget", label: "Home", description: "Overview and widgets", icon: Home },
  {
    href: "/budget/transactions",
    label: "Transactions",
    description: "Everything you've recorded",
    icon: ArrowLeftRight,
  },
  { href: "/budget/budgets", label: "Budgets", description: "Spending limits by period", icon: PieChart },
  {
    href: "/budget/subscriptions",
    label: "Subscriptions",
    description: "Recurring payments",
    icon: Repeat,
  },
  { href: "/budget/more", label: "More", description: "Everything else", icon: LayoutGrid },
];

/** The full menu, shown in the sidebar and on the "More" screen. */
export const BUDGET_NAV_SECTIONS: { title: string; items: BudgetNavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/budget", label: "Home", description: "Overview and widgets", icon: Home },
      {
        href: "/budget/transactions",
        label: "Transactions",
        description: "Everything you've recorded",
        icon: ArrowLeftRight,
      },
    ],
  },
  {
    title: "Planning",
    items: [
      { href: "/budget/budgets", label: "Budgets", description: "Spending limits by period", icon: PieChart },
      { href: "/budget/goals", label: "Goals", description: "Save or spend towards a target", icon: Flag },
      { href: "/budget/loans", label: "Loans", description: "Money lent and borrowed", icon: CreditCard },
      {
        href: "/budget/policies",
        label: "Policies",
        description: "Insurance, SIP, PPF and deposits",
        icon: ShieldCheck,
      },
    ],
  },
  {
    title: "Scheduled",
    items: [
      { href: "/budget/subscriptions", label: "Subscriptions", description: "Recurring payments", icon: Repeat },
      {
        href: "/budget/upcoming",
        label: "Upcoming & Overdue",
        description: "Unpaid scheduled transactions",
        icon: CalendarClock,
      },
    ],
  },
  {
    title: "Organise",
    items: [
      { href: "/budget/accounts", label: "Accounts", description: "Where your money sits", icon: Wallet },
      { href: "/budget/categories", label: "Categories", description: "How spending is grouped", icon: Shapes },
      { href: "/budget/settings", label: "Settings", description: "Budget-only preferences", icon: Settings },
    ],
  },
];

export function isBudgetActive(pathname: string, href: string): boolean {
  if (href === "/budget") return pathname === "/budget";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Bottom tab bar, mirroring the stock app's but with budget destinations. */
export function BudgetTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className={cn("fixed inset-x-0 bottom-0 z-40 lg:hidden", "material hairline-t", "safe-bottom")}
      aria-label="Budget"
    >
      <ul className="mx-auto flex max-w-2xl items-stretch justify-around px-1 pt-1.5 pb-1">
        {BUDGET_TAB_ITEMS.map((tab) => {
          const active = isBudgetActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex flex-col items-center gap-[3px] rounded-xl py-1 transition-colors duration-150",
                  active ? "bg-green/10 dark:bg-green/20" : "",
                )}
              >
                <motion.span
                  whileTap={{ scale: 0.86 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  className="relative flex h-6 w-6 items-center justify-center"
                >
                  <Icon
                    size={23}
                    strokeWidth={active ? 2.4 : 1.9}
                    className={cn(
                      "transition-colors duration-200",
                      active ? "text-green" : "text-label-secondary/50",
                    )}
                  />
                </motion.span>
                <span
                  className={cn(
                    "text-[10px] font-medium leading-none tracking-tight transition-colors duration-200",
                    active ? "text-green font-semibold" : "text-label-secondary/50",
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BudgetTabBarSpacer() {
  return <div aria-hidden className="h-[64px] safe-bottom lg:hidden" />;
}

/**
 * Desktop sidebar.
 *
 * Mirrors the stock app's sidebar structure — wordmark, nav, footer — so the
 * two environments feel like one product. The colour is the tell: budget is
 * green throughout where the stock side is blue.
 */
export function BudgetSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-separator/40 bg-bg-secondary/60 backdrop-blur-ios lg:flex dark:border-white/[0.06]"
      aria-label="Budget"
    >
      {/* Environment switcher, in place of a wordmark: which of the two apps
          you are in is more useful here than repeating the app's own name. */}
      <div className="px-3 pb-3 pt-5">
        <EnvironmentSwitcher active="budget" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {BUDGET_NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-4">
            <p className="px-3 pb-1 text-caption2 font-semibold uppercase tracking-wide text-label-secondary/50">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isBudgetActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-ios px-3 py-2 transition-colors",
                        active
                          ? "bg-green/10 text-green dark:bg-green/15"
                          : "text-label hover:bg-fill/10",
                      )}
                    >
                      <Icon size={19} strokeWidth={active ? 2.3 : 1.9} />
                      <span className={cn("text-subhead", active && "font-semibold")}>
                        {item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

    </aside>
  );
}

/**
 * Re-exported so budget components keep a single import site. The component
 * itself is shared with StockSensei — see `ui/environment-switcher`.
 */
export { EnvironmentSwitcher, EnvironmentSwitcherCompact } from "@/components/ui/environment-switcher";
