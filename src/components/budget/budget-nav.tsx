"use client";

/**
 * Navigation for the budget environment.
 *
 * Deliberately separate from the stock app's `NAV_ITEMS`: the two environments
 * share a codebase and an auth session but nothing else, so each gets its own
 * tab bar, sidebar and settings. The environment switcher at the top of the
 * sidebar (and in the budget header on mobile) is the only crossing point.
 */

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowsLeftRight, CalendarCheck, ChartPie, CreditCard, Flag, Gear, House, Icon, Repeat, Shapes, ShieldCheck, SignOut, SquaresFour, Wallet, X } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { EnvironmentSwitcher } from "@/components/ui/environment-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useSession } from "@/components/auth/session-provider";

export interface BudgetNavItem {
  href: string;
  label: string;
  description: string;
  icon: Icon;
}

/** The five destinations that get a bottom tab on mobile. */
export const BUDGET_TAB_ITEMS: BudgetNavItem[] = [
  { href: "/budget", label: "Home", description: "Overview and widgets", icon: House },
  {
    href: "/budget/transactions",
    label: "Transactions",
    description: "Everything you've recorded",
    icon: ArrowsLeftRight,
  },
  { href: "/budget/budgets", label: "Budgets", description: "Spending limits by period", icon: ChartPie },
  {
    href: "/budget/subscriptions",
    label: "Subscriptions",
    description: "Recurring payments",
    icon: Repeat,
  },
  { href: "/budget/more", label: "More", description: "Everything else", icon: SquaresFour },
];

/** The full menu, shown in the sidebar and on the "More" screen. */
export const BUDGET_NAV_SECTIONS: { title: string; items: BudgetNavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/budget", label: "Home", description: "Overview and widgets", icon: House },
      {
        href: "/budget/transactions",
        label: "Transactions",
        description: "Everything you've recorded",
        icon: ArrowsLeftRight,
      },
    ],
  },
  {
    title: "Planning",
    items: [
      { href: "/budget/budgets", label: "Budgets", description: "Spending limits by period", icon: ChartPie },
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
        icon: CalendarCheck,
      },
    ],
  },
  {
    title: "Organise",
    items: [
      { href: "/budget/accounts", label: "Accounts", description: "Where your money sits", icon: Wallet },
      { href: "/budget/categories", label: "Categories", description: "How spending is grouped", icon: Shapes },
      { href: "/budget/settings", label: "Settings", description: "Budget-only preferences", icon: Gear },
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
  const router = useRouter();
  const { user, signOut } = useSession();

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
                      <Icon size={19} />
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

      <div className="mt-auto border-t border-separator/40 p-3 dark:border-white/[0.06]">
        <button 
          onClick={async () => {
            await signOut();
            router.refresh();
          }}
          className="flex w-full items-center gap-3 rounded-xl p-2 hover:bg-fill/10 transition-colors text-left group"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green/10 text-green shadow-sm ring-1 ring-green/20 group-hover:bg-green group-hover:text-white transition-colors">
            <span className="text-footnote font-bold">{user?.email?.charAt(0).toUpperCase() || "U"}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-footnote font-semibold text-label">{user?.email?.split('@')[0] || "User"}</p>
            <p className="truncate text-caption2 text-label-secondary/70">{user?.email || "Signed in"}</p>
          </div>
          <SignOut size={16} className="text-label-secondary/50 shrink-0 group-hover:text-label transition-colors" />
        </button>
      </div>
    </aside>
  );
}

/**
 * Mobile drawer — the phone's stand-in for the sidebar.
 *
 * The tab bar only carries five of the fourteen destinations; without this the
 * rest are reachable only through "More". Mirrors the stock app's
 * `MobileSidebar` so the two environments open the same way, in green.
 */
export function BudgetMobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  // Hold the page still behind the drawer.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden"
            aria-hidden
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Budget menu"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 35, mass: 0.9 }}
            className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-separator/40 bg-bg-secondary p-5 shadow-2xl lg:hidden dark:border-white/[0.08]"
          >
            <div className="flex items-start justify-between gap-2 pb-4">
              <div className="min-w-0 flex-1">
                <EnvironmentSwitcher active="budget" />
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-label-secondary/70 transition-colors hover:bg-fill/[0.12] hover:text-label"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto">
              {BUDGET_NAV_SECTIONS.map((section) => (
                <div key={section.title} className="mb-4">
                  <p className="px-3.5 pb-1 text-caption2 font-semibold uppercase tracking-wide text-label-secondary/50">
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
                            onClick={onClose}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex items-center gap-3 rounded-ios px-3.5 py-2.5 transition-colors",
                              active
                                ? "bg-green/10 text-green dark:bg-green/15"
                                : "text-label hover:bg-fill/[0.08]",
                            )}
                          >
                            <Icon size={20} className="shrink-0" />
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

            <div className="flex items-center justify-between border-t border-separator/30 px-1 pt-3 dark:border-white/[0.06]">
              <span className="text-footnote font-medium text-label-secondary">Appearance</span>
              <ThemeToggle />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Re-exported so budget components keep a single import site. The component
 * itself is shared with StockSensei — see `ui/environment-switcher`.
 */
export { EnvironmentSwitcher, EnvironmentSwitcherCompact } from "@/components/ui/environment-switcher";
