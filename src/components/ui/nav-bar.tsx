"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Menu, Search } from "lucide-react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { CONTAINER_WIDTHS, type ContainerWidth } from "./page-container";
import { StockSearchModal } from "@/components/stock/stock-search-modal";
import { MobileSidebar } from "./mobile-sidebar";

interface NavBarProps {
  title: string;
  /** iOS large title that shrinks into the bar as the page scrolls. */
  largeTitle?: boolean;
  showBack?: boolean;
  subtitle?: string;
  trailing?: React.ReactNode;
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
  width = "wide",
}: NavBarProps) {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
          scrolled ? "material hairline-b" : "bg-transparent",
        )}
      >
        <div className={cn("mx-auto flex h-[44px] items-center gap-1.5", containerWidth)}>
          {showBack ? (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => router.back()}
              className="-ml-1 flex items-center gap-0.5 rounded-lg px-1 py-1 text-blue"
              aria-label="Go back"
            >
              <ChevronLeft size={26} strokeWidth={2.4} />
              <span className="text-body -ml-1">Back</span>
            </motion.button>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-1.5 rounded-lg p-1.5 text-label-secondary transition-colors hover:bg-fill/[0.12] hover:text-label lg:hidden"
              aria-label="Open menu"
              title="Open Navigation Menu"
            >
              <Menu size={22} strokeWidth={2.2} />
            </button>
          )}

          <div className="flex flex-1 justify-center overflow-hidden px-2">
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
          </div>

          <div className="flex min-w-[44px] items-center justify-end gap-1.5">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-fill/[0.12] px-2.5 py-1 text-caption2 font-semibold text-label-secondary transition-colors hover:bg-fill/[0.20] hover:text-label dark:bg-white/[0.08] dark:hover:bg-white/[0.15]"
              title="Search and Evaluate Stock (Ctrl+K)"
            >
              <Search size={14} className="text-blue" />
              <span className="hidden sm:inline">Evaluate Stock</span>
              <kbd className="hidden font-mono text-[10px] opacity-60 md:inline">⌘K</kbd>
            </button>
            {trailing}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <MobileSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenSearch={() => setSearchOpen(true)}
      />

      <StockSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Occupies the fixed bar's height in normal flow. */}
      <div className="h-[44px] safe-top" aria-hidden />

      {largeTitle && (
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
