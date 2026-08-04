"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Search, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { isActivePath, NAV_ITEMS } from "./nav-items";
import { StockSearchModal } from "@/components/stock/stock-search-modal";

/** Width of the fixed sidebar. Layouts offset by this at `lg` and above. */
export const SIDEBAR_WIDTH = 248;

export function SidebarNav() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-separator/40 bg-bg-secondary/60 backdrop-blur-ios lg:flex dark:border-white/[0.06]"
        aria-label="Primary"
      >
        {/* Wordmark */}
        <Link href="/home" className="flex items-center gap-2.5 px-5 pb-3 pt-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-blue shadow-pill">
            <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" aria-hidden>
              <path
                d="M5 22.5 12 14l5 5 9.5-11"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M20.5 8h6v6"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>
            <span className="block text-headline font-bold tracking-tight text-label">
              StockSensei
            </span>
            <span className="block text-caption2 text-label-secondary/50">NSE &amp; BSE screener</span>
          </span>
        </Link>

        {/* Quick Search Button */}
        <div className="px-3 pb-3">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex w-full items-center justify-between gap-2 rounded-[11px] border border-separator/40 bg-bg-primary/80 px-3 py-2 text-footnote text-label-secondary shadow-subtle transition-all hover:border-blue/40 hover:text-label dark:border-white/[0.08]"
          >
            <span className="flex items-center gap-2">
              <Search size={15} className="text-blue" />
              <span>Evaluate Stock...</span>
            </span>
            <kbd className="rounded bg-fill/[0.12] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-label-secondary opacity-70">
              ⌘K
            </kbd>
          </button>
        </div>

      <nav className="flex-1 px-3">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-[11px] px-3 py-2.5 transition-colors",
                    active ? "text-label" : "text-label-secondary/65 hover:bg-fill/[0.06]",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="sidebar-active"
                      transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.8 }}
                      className="absolute inset-0 -z-10 rounded-[11px] bg-blue/[0.12]"
                    />
                  )}
                  <Icon
                    size={19}
                    strokeWidth={active ? 2.4 : 2}
                    className={cn("shrink-0", active ? "text-blue" : "text-label-secondary/50")}
                  />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate text-subhead",
                        active ? "font-semibold text-blue" : "font-medium",
                      )}
                    >
                      {item.label}
                    </span>
                    <span className="block truncate text-caption2 text-label-secondary/45">
                      {item.description}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-5 pb-5 pt-3">
        <Link
          href="/disclaimer"
          className="flex items-start gap-2 rounded-[11px] bg-amber/[0.09] px-3 py-2.5 transition-colors hover:bg-amber/[0.14]"
        >
          <ShieldAlert size={14} className="mt-[1px] shrink-0 text-amber" strokeWidth={2.3} />
          <span className="text-caption2 leading-snug text-label-secondary/65">
            Educational screener — not investment advice, not a broker.
          </span>
        </Link>
      </div>
    </aside>

    <StockSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
  </>
  );
}
