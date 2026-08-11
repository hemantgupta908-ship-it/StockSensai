"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MagnifyingGlass, X } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { isActivePath, NAV_SECTIONS } from "./nav-items";
import { EnvironmentSwitcher } from "./environment-switcher";
import { ThemeToggle } from "./theme-toggle";

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
  onOpenSearch: () => void;
}

export function MobileSidebar({ open, onClose, onOpenSearch }: MobileSidebarProps) {
  const pathname = usePathname();

  // Prevent background body scroll when mobile drawer is open
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Close drawer when escape key is pressed
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop Blur Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            aria-hidden
          />

          {/* Slide-over Left Drawer Panel */}
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 35, mass: 0.9 }}
            className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-separator/40 bg-bg-elevated p-5 shadow-2xl dark:border-white/[0.08]"
          >
            {/* Header / Brand Wordmark & Close Button */}
            <div className="flex items-center justify-between pb-4">
              <Link
                href="/home"
                onClick={onClose}
                className="flex items-center gap-2.5"
              >
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
                <div>
                  <span className="block text-headline font-bold tracking-tight text-label">
                    StockSensei
                  </span>
                  <span className="block text-caption2 text-label-secondary/50">
                    NSE &amp; BSE screener
                  </span>
                </div>
              </Link>

              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-label-secondary/70 transition-colors hover:bg-fill/[0.12] hover:text-label"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            {/* Crossing point to the budget environment. */}
            <div className="pt-1">
              <EnvironmentSwitcher active="stocks" onClick={onClose} />
            </div>

            {/* Quick Search Button */}
            <div className="pb-4 pt-3">
              <button
                onClick={() => {
                  onClose();
                  onOpenSearch();
                }}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-separator/40 bg-bg-elevated px-3.5 py-2.5 text-subhead font-medium text-label-secondary shadow-subtle transition-all hover:border-blue/40 hover:text-label dark:border-white/[0.08]"
              >
                <span className="flex items-center gap-2">
                  <MagnifyingGlass size={16} className="text-blue" />
                  <span>Evaluate Stock...</span>
                </span>
                <kbd className="rounded bg-fill/[0.12] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-label-secondary opacity-70">
                  ⌘K
                </kbd>
              </button>
            </div>

            {/* Navigation List */}
            <nav className="flex-1 overflow-y-auto pt-1">
              {NAV_SECTIONS.map((section) => (
                <div key={section.title} className="mb-4">
                  <p className="px-3.5 pb-1 text-caption2 font-semibold uppercase tracking-wide text-label-secondary/50">
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
                            onClick={onClose}
                            className={cn(
                              "flex items-center gap-3 rounded-ios px-3.5 py-2.5 transition-colors",
                              active
                                ? "bg-blue/10 text-blue dark:bg-blue/15"
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

            {/* Footer.
                The disclaimer notice that used to sit here is gone; the drawer
                still links to the full text under Organise, and every screen
                carries `DisclaimerFooter`, so the standing requirement to show
                it is still met. */}
            <div className="border-t border-separator/30 pt-3 dark:border-white/[0.06]">
              <div className="flex items-center justify-between px-1">
                <span className="text-footnote font-medium text-label-secondary">
                  Appearance
                </span>
                <ThemeToggle />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
