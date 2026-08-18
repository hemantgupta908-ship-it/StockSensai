"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretLeft, List, MagnifyingGlass } from "@phosphor-icons/react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { CONTAINER_WIDTHS, type ContainerWidth } from "./page-container";
import { StockSearchModal } from "@/components/stock/stock-search-modal";
import { MobileSidebar } from "./mobile-sidebar";
import { IS_MOBILE } from "@/lib/mobile/config";
import { useAppPathname } from "@/lib/use-app-pathname";

const ROOT_PATHS = ["/", "/home", "/watchlist", "/portfolio", "/budget", "/budget/transactions", "/settings"];

interface NavBarProps {
  /**
   * Omit on pages whose content already announces itself — the bar then keeps
   * its controls without repeating a heading the user does not need.
   */
  title?: string;
  /** iOS large title that shrinks into the bar as the page scrolls. */
  largeTitle?: boolean;
  showBack?: boolean;
  subtitle?: string;
  trailing?: React.ReactNode;
  hideSearch?: boolean;
  hideThemeToggle?: boolean;
  /**
   * Content width. Must match the page's own PageContainer, or the large title
   * won't line up with the content beneath it.
   */
  width?: ContainerWidth;
}

export function NavBar({
  title,
  largeTitle = false,
  showBack,
  subtitle,
  trailing,
  hideSearch = false,
  hideThemeToggle = false,
  width = "wide",
}: NavBarProps) {
  const router = useRouter();
  const pathname = useAppPathname();
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isRoot = ROOT_PATHS.includes(pathname);
  const shouldShowBack = showBack !== undefined ? showBack : !isRoot;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > (largeTitle ? 44 : 8));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [largeTitle]);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const containerWidth = CONTAINER_WIDTHS[width];

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-30 safe-top lg:left-[248px]",
          "transition-all duration-300",
          // Always opaque in the APK. The transparent-until-scrolled treatment
          // relies on the page being at scroll 0 whenever the bar is see-through,
          // and in a WebView that is not dependable — the settings screen showed
          // its own "ACCOUNT" heading through the bar, on top of the title.
          // A frosted bar costs an effect; a legible one is not optional.
          IS_MOBILE || scrolled ? "material hairline-b" : "bg-transparent",
        )}
      >
        <div className={cn("mx-auto flex h-[44px] items-center gap-1.5", containerWidth)}>
          {/* Mobile sidebar hamburger menu button */}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-label transition-colors hover:bg-fill/[0.12] lg:hidden focus:outline-none shrink-0"
            aria-label="Open menu"
            title="Open Navigation List"
          >
            <div className="flex w-[18px] flex-col gap-[4px]">
              <span className="h-[2px] w-full rounded-full bg-current" />
              <span className="h-[2px] w-full rounded-full bg-current" />
              <span className="h-[2px] w-full rounded-full bg-current" />
            </div>
          </button>

          {/* Back button (rendered automatically on all sub-pages or when showBack is specified) */}
          {shouldShowBack ? (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => router.back()}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-label transition-colors hover:bg-fill/10 hover:text-label active:bg-fill/20 shrink-0"
              aria-label="Go back"
              title="Go back"
            >
              <CaretLeft size={22} weight="bold" />
            </motion.button>
          ) : null}

          <div className="flex flex-1 items-center justify-start overflow-hidden px-1 sm:px-2">
            {title ? (
              <motion.h1
                animate={{
                  opacity: largeTitle ? (scrolled ? 1 : 0) : 1,
                  y: largeTitle ? (scrolled ? 0 : 6) : 0,
                }}
                transition={{ duration: 0.2 }}
                className="truncate text-headline font-semibold text-label"
              >
                {title}
              </motion.h1>
            ) : null}
          </div>

          <div className="flex min-w-[44px] items-center justify-end gap-1.5">
            {!hideSearch && (
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-1.5 rounded-full bg-fill/[0.12] px-2.5 py-1 text-caption2 font-semibold text-label-secondary transition-colors hover:bg-fill/[0.20] hover:text-label dark:bg-white/[0.08] dark:hover:bg-white/[0.15]"
                title="Search and Evaluate Stock (Ctrl+K)"
              >
                <MagnifyingGlass size={14} className="text-accent" />
                <span className="hidden sm:inline">Evaluate Stock</span>
                <kbd className="hidden font-mono text-[10px] opacity-60 md:inline">⌘K</kbd>
              </button>
            )}
            {trailing}
            {!hideThemeToggle && <ThemeToggle />}
          </div>
        </div>
      </header>

      <MobileSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenSearch={() => setSearchOpen(true)}
      />

      <StockSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Occupies the fixed bar's full height — the 44pt row and the status-bar
          inset above it. See `.safe-top-bar-spacer`; this must stay in step with
          the header's own height or the first element on the page slides
          underneath it. */}
      <div className="safe-top-bar-spacer" aria-hidden />

      {largeTitle && title && (
        <div className={cn("mx-auto pb-4 pt-1 lg:pt-3", containerWidth)}>
          <h1 className="text-largetitle font-bold tracking-tight text-label lg:text-[40px] lg:leading-[46px]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-subhead text-label-secondary/60">{subtitle}</p>
          )}
        </div>
      )}
    </>
  );
}
