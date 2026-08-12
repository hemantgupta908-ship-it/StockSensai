"use client";
import { useShallow } from "zustand/react/shallow";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MagnifyingGlass, SignOut, X } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { useSession } from "@/components/auth/session-provider";
import { useBudget } from "@/components/budget/budget-provider";
import { UserAvatar } from "@/components/budget/user-avatar";
import { NAV_SECTIONS } from "./nav-items";
import { isActivePath } from "./nav";

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
  /** Omitted where there is no search to open, e.g. from a money screen. */
  onOpenSearch?: () => void;
}

export function MobileSidebar({ open, onClose, onOpenSearch }: MobileSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useSession();
  const { settings  } = useBudget(useShallow((s) => ({ settings: s.settings })));

  const email = user?.email || "hemantgupta908@gmail.com";
  const username = email.split("@")[0] || "Profile";

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
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent shadow-pill">
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
                    WealthSensei
                  </span>
                  <span className="block text-caption2 text-label-secondary/50">
                    NSE &amp; BSE screener
                  </span>
                </div>
              </Link>

              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center text-label-secondary transition-colors hover:text-label focus:outline-none"
                aria-label="Close menu"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
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
                            prefetch={true}
                            className={cn(
                              "flex items-center gap-3 rounded-ios px-3.5 py-2.5 transition-colors",
                              active
                                ? "bg-accent/15 text-accent dark:bg-accent/20"
                                : "text-label hover:bg-fill/[0.08]",
                            )}
                          >
                            <Icon size={20} weight="regular" className="shrink-0" />
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

            {/* Profile & Logout Footer */}
            <div className="border-t border-separator/30 pt-3 dark:border-white/[0.06]">
              <div className="flex items-center justify-between gap-2 rounded-2xl p-2 transition-colors hover:bg-fill/10">
                <Link
                  href="/settings"
                  onClick={onClose}
                  className="flex flex-1 items-center gap-3 min-w-0"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-separator/50 bg-bg-secondary shadow-xs dark:border-white/10 overflow-hidden">
                    <UserAvatar
                      avatarVal={settings?.userAvatar || "initial"}
                      email={email}
                      className="h-full w-full text-base"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-footnote font-bold text-label">
                      {username}
                    </p>
                    <p className="truncate text-caption2 text-label-secondary/60">
                      {email}
                    </p>
                  </div>
                </Link>

                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    onClose();
                    await signOut();
                    router.refresh();
                  }}
                  title="Sign out"
                  aria-label="Sign out"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red text-white shadow-xs hover:bg-red/90 transition-colors focus:outline-none"
                >
                  <SignOut size={18} weight="regular" />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
