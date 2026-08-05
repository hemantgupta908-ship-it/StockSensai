"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { isActivePath, NAV_SECTIONS } from "./nav-items";
import { EnvironmentSwitcher } from "./environment-switcher";
import { StockSearchModal } from "@/components/stock/stock-search-modal";

/** Width of the fixed sidebar. Layouts offset by this at `lg` and above. */
export const SIDEBAR_WIDTH = 248;

/**
 * StockSensei's sidebar.
 *
 * Structurally identical to the budget environment's — switcher, grouped
 * sections, footer — so moving between the two never feels like changing app.
 * Blue is the only tell; budget is green.
 */
export function SidebarNav() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-separator/40 bg-bg-secondary/60 backdrop-blur-ios lg:flex dark:border-white/[0.06]"
        aria-label="Primary"
      >
        {/* Environment switcher, in place of a wordmark. */}
        <div className="px-3 pb-3 pt-5">
          <EnvironmentSwitcher active="stocks" />
        </div>

        {/* Quick search — StockSensei's most-used action, so it stays near the top. */}
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

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="mb-4">
              <p className="px-3 pb-1 text-caption2 font-semibold uppercase tracking-wide text-label-secondary/50">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-ios px-3 py-2 transition-colors",
                          active
                            ? "bg-blue/10 text-blue dark:bg-blue/15"
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

        {/* The disclaimer is a licensing requirement, so it stays pinned. */}
        <div className="border-t border-separator/40 p-3 dark:border-white/[0.06]">
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
