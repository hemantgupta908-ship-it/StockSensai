"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { isActivePath, NAV_ITEMS } from "./nav-items";

/**
 * iOS bottom tab bar. Translucent so content shows through as it scrolls
 * underneath, with the safe-area inset respected on notched devices.
 *
 * Hidden from `lg` up, where the sidebar takes over.
 */
export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 lg:hidden",
        "material hairline-t",
        "safe-bottom",
      )}
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-2xl items-stretch justify-around px-1 pt-1.5 pb-1">
        {NAV_ITEMS.map((tab) => {
          const active = isActivePath(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex flex-col items-center gap-[3px] rounded-xl py-1 transition-colors duration-150",
                  active ? "bg-blue/10 dark:bg-blue/20" : "",
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
                      active ? "text-blue" : "text-label-secondary/50",
                    )}
                  />
                </motion.span>
                <span
                  className={cn(
                    "text-[10px] font-medium leading-none tracking-tight transition-colors duration-200",
                    active ? "text-blue font-semibold" : "text-label-secondary/50",
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

/** Spacer so page content is never hidden behind the fixed tab bar. */
export function TabBarSpacer() {
  return <div className="h-[64px] safe-bottom lg:hidden" aria-hidden />;
}
