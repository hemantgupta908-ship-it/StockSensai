"use client";
import { useShallow } from "zustand/react/shallow";

/**
 * Presentation pieces that are genuinely specific to the budget environment.
 *
 * Everything here either reads budget state (`Amount`), resolves a budget icon
 * (`CategoryDot`), or is chrome awaiting reconciliation with its `ui/`
 * counterpart. The generic primitives that used to live here have moved to the
 * shared kit and are re-exported below.
 */

import React, { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CaretLeft, Plus } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { CONTAINER_WIDTHS, type ContainerWidth } from "@/components/ui/page-container";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Card as SharedCard } from "@/components/ui/card";
import { Sheet as SharedSheet } from "@/components/ui/sheet";
import { formatCurrencyAmount } from "@/lib/budget/currency";
import { getIcon } from "@/lib/budget/icons";
import { useBudget } from "./budget-provider";
import { MobileSidebar } from "@/components/ui/mobile-sidebar";
import { useAppPathname } from "@/lib/use-app-pathname";

/**
 * Re-exported from the shared kit.
 *
 * These were budget-only implementations of things that are not budget-specific
 * at all, and the stock side had no equivalent — which is why its forms ended up
 * with placeholder-only inputs. They now live in `@/components/ui` and are
 * re-exported here so existing imports keep working unchanged; new code should
 * import them from `@/components/ui/*` directly.
 */
export { Field, TextInput, inputClass } from "@/components/ui/field";
export { AmountInput } from "@/components/ui/amount-input";
export { SelectInput } from "@/components/ui/select-input";
export { Toggle } from "@/components/ui/toggle";
export { SearchField } from "@/components/ui/search-field";
export { ProgressBar } from "@/components/ui/progress-bar";
export { EmptyState } from "@/components/ui/empty-state";
export { Section } from "@/components/ui/section";

// ---------------------------------------------------------------------------
// Page chrome
// ---------------------------------------------------------------------------

/**
 * Page chrome shares the stock app's container widths so the two environments
 * line up on the same grid. `width` must match the `BudgetPage` beneath it, or
 * the title will not sit above the content it belongs to.
 */
export function BudgetHeader({
  title,
  subtitle,
  backHref,
  action,
  large = false,
  width = "wide",
}: {
  title?: string;
  subtitle?: string;
  backHref?: string;
  action?: React.ReactNode;
  large?: boolean;
  width?: ContainerWidth;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = useAppPathname();
  const isRootBudget = pathname === "/budget" || pathname === "/budget/transactions";
  const shouldShowBack = Boolean(backHref) || !isRootBudget;

  return (
    <>
      <header className="sticky top-0 z-30 material hairline-b safe-top">
      <div className={cn("mx-auto flex items-center gap-2 py-3", CONTAINER_WIDTHS[width])}>
        {/* On mobile: Render Back button on sub-pages, hamburger menu on root pages */}
        {shouldShowBack ? (
          <button
            type="button"
            onClick={() => (backHref ? router.push(backHref) : router.back())}
            className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-label transition-all hover:bg-fill/[0.12] active:scale-95"
            aria-label="Go back"
            title="Go back"
          >
            <CaretLeft size={22} weight="bold" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-label transition-colors hover:bg-fill/[0.12] lg:hidden focus:outline-none"
            aria-label="Open menu"
          >
            <div className="flex w-[18px] flex-col gap-[4px]">
              <span className="h-[2px] w-full rounded-full bg-current" />
              <span className="h-[2px] w-full rounded-full bg-current" />
              <span className="h-[2px] w-full rounded-full bg-current" />
            </div>
          </button>
        )}

        <div className="min-w-0 flex-1">
          {title ? (
            <h1
              className={cn(
                "truncate font-semibold tracking-tight text-label",
                large ? "text-title1" : "text-headline",
              )}
            >
              {title}
            </h1>
          ) : null}
          {subtitle ? (
            <p className="truncate text-caption text-label-secondary/60">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {action}
        </div>
      </div>
      </header>

      {/* Outside the header: `sticky` + `z-30` makes a stacking context, and the
          drawer must sit above the tab bar rather than under it. */}
      <MobileSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

export function BudgetPage({
  children,
  width = "wide",
}: {
  children: React.ReactNode;
  width?: ContainerWidth;
}) {
  return (
    <main className={cn("mx-auto pb-10 pt-5", CONTAINER_WIDTHS[width])}>{children}</main>
  );
}

/**
 * The budget environment's card look: borderless, flat `p-4` padding.
 *
 * Delegates to the shared `Card`, which grew the `href` / `onClick`
 * polymorphism this one had. The two differ only in padding and the hairline
 * border, both of which are deliberate looks rather than drift.
 */
export function Card({
  className,
  ...props
}: React.ComponentProps<typeof SharedCard>) {
  return (
    <SharedCard
      bordered={false}
      className={cn("block p-4 transition-all duration-200 ease-out", className)}
      {...props}
    />
  );
}

function OdometerDigit({ digit, delay = 0 }: { digit: number; delay?: number }) {
  return (
    <span className="inline-block relative overflow-hidden h-[1.15em] select-none align-bottom">
      <motion.span
        initial={{ y: "0%" }}
        animate={{ y: `-${digit * 10}%` }}
        transition={{
          duration: 1.8,
          delay,
          ease: [0.16, 1, 0.3, 1],
        }}
        className="flex flex-col items-center"
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <span key={d} className="h-[1.15em] leading-[1.15em] flex items-center justify-center">
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

export function AnimatedNumberTicker({ value, className, baseDelay = 0 }: { value: string | number; className?: string; baseDelay?: number }) {
  const strValue = String(value);
  const characters = strValue.split("");

  let digitCount = 0;

  return (
    <span className={cn("inline-flex items-baseline tabular-nums leading-none", className)}>
      {characters.map((char, index) => {
        const isDigit = char >= "0" && char <= "9";
        if (isDigit) {
          const digit = parseInt(char, 10);
          const currentDelay = baseDelay + digitCount * 0.08;
          digitCount++;
          return <OdometerDigit key={`${index}-${char}`} digit={digit} delay={currentDelay} />;
        }
        return (
          <span key={`${index}-${char}`} className="inline-block">
            {char}
          </span>
        );
      })}
    </span>
  );
}

export function AnimatedNumberBlur({ value, className, baseDelay = 0 }: { value: string | number; className?: string; baseDelay?: number }) {
  return (
    <motion.span
      initial={{ opacity: 0, filter: "blur(8px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.8, delay: baseDelay, ease: "easeOut" }}
      className={className}
    >
      {value}
    </motion.span>
  );
}

export function AnimatedNumberBounce({ value, className, baseDelay = 0 }: { value: string | number; className?: string; baseDelay?: number }) {
  return (
    <motion.span
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 15, delay: baseDelay }}
      className={className}
    >
      {value}
    </motion.span>
  );
}

export function AnimatedNumberSlide({ value, className, baseDelay = 0 }: { value: string | number; className?: string; baseDelay?: number }) {
  return (
    <motion.span
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: baseDelay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {value}
    </motion.span>
  );
}

export function RandomEntranceAnimator({ children, className }: { children: React.ReactNode; className?: string }) {
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [animType, setAnimType] = useState(0);
  const [baseDelay, setBaseDelay] = useState(0);

  useEffect(() => {
    // 50% chance to animate
    const willAnimate = Math.random() > 0.5;
    if (willAnimate) {
      setShouldAnimate(true);
      setAnimType(Math.floor(Math.random() * 4));
      setBaseDelay(Math.random() * 0.5);
    }
  }, []);

  if (!shouldAnimate) {
    return <div className={className}>{children}</div>;
  }

  switch (animType) {
    case 0:
      return (
        <motion.div initial={{ opacity: 0, filter: "blur(10px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ duration: 0.8, delay: baseDelay }} className={className}>
          {children}
        </motion.div>
      );
    case 1:
      return (
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: baseDelay, ease: "easeOut" }} className={className}>
          {children}
        </motion.div>
      );
    case 2:
      return (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", damping: 15, delay: baseDelay }} className={className}>
          {children}
        </motion.div>
      );
    case 3:
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: baseDelay }} className={className}>
          {children}
        </motion.div>
      );
    default:
      return <div className={className}>{children}</div>;
  }
}

/** Floating add button with ambient breathing pulse aura. */
export function AddFab({ onClick, label = "Add" }: { onClick: () => void; label?: string }) {
  return (
    <div className="fixed bottom-[80px] right-5 z-40 lg:bottom-8 lg:right-8">
      {/* Ambient Breathing Glow Aura */}
      <span className="absolute inset-0 rounded-full bg-accent/40 blur-md animate-pulse" />

      <motion.button
        type="button"
        onClick={onClick}
        aria-label={label}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-pill hover:shadow-xl transition-shadow"
      >
        <Plus size={26} weight="bold" />
      </motion.button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Renders an amount in the primary currency with smooth animated number rolling.
 */
export function Amount({
  value,
  currency,
  className,
  showSign = false,
  colour = false,
  decimals,
  compact = false,
  animated,
}: {
  value: number;
  currency?: string | null;
  className?: string;
  showSign?: boolean;
  /** Tint green for positive, red for negative. */
  colour?: boolean;
  decimals?: number;
  compact?: boolean;
  /** Enable mechanical odometer rolling animation for hero metrics. */
  animated?: boolean;
}) {
  const { allWallets, settings  } = useBudget(useShallow((s) => ({ allWallets: s.allWallets, settings: s.settings })));
  const code = currency ?? allWallets.primaryCurrency;
  const text = formatCurrencyAmount(value, code, {
    showSign,
    compact,
    decimals: decimals ?? (settings.showDecimals ? undefined : 0),
    obfuscate: settings.hideAmounts,
  });

  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [baseDelay, setBaseDelay] = useState(0);
  const [animType, setAnimType] = useState(0);

  useEffect(() => {
    if (animated === true) {
      setShouldAnimate(true);
      setBaseDelay(0);
      setAnimType(Math.floor(Math.random() * 4));
    } else if (animated === undefined) {
      // 30% chance to animate randomly if not explicitly requested
      const willAnimate = Math.random() > 0.7;
      if (willAnimate) {
        setShouldAnimate(true);
        // Random delay between 0s and 1.2s to stagger animations
        setBaseDelay(Math.random() * 1.2);
        setAnimType(Math.floor(Math.random() * 4));
      }
    } else {
      setShouldAnimate(false);
    }
  }, [animated]);

  // Use the random state, but fallback to direct prop if true to avoid delay when requested
  const showOdometer = animated === true || shouldAnimate;
  const delayToUse = animated === true ? 0 : baseDelay;

  const renderAnimation = () => {
    switch (animType) {
      case 0: return <AnimatedNumberTicker value={text} baseDelay={delayToUse} />;
      case 1: return <AnimatedNumberBlur value={text} baseDelay={delayToUse} />;
      case 2: return <AnimatedNumberBounce value={text} baseDelay={delayToUse} />;
      case 3: return <AnimatedNumberSlide value={text} baseDelay={delayToUse} />;
      default: return <AnimatedNumberTicker value={text} baseDelay={delayToUse} />;
    }
  };

  return (
    <span
      className={cn(
        "inline-flex items-center tabular-nums transition-colors duration-300 ease-out",
        colour && (value > 0 ? "text-green" : value < 0 ? "text-red" : "text-label"),
        settings.hideAmounts && "font-mono tracking-widest text-label-secondary/50 select-none",
        className,
      )}
    >
      {showOdometer ? renderAnimation() : text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * Thin wrapper over the shared `SegmentedControl`.
 *
 * The prop shapes were already identical, so every existing call site gets the
 * sliding spring indicator and `role="tablist"` / `aria-selected` semantics for
 * free. `size="sm"` is the variant that matches what this used to render.
 */
export function SegmentedTabs<T extends string>(props: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return <SegmentedControl size="sm" {...props} />;
}

// ---------------------------------------------------------------------------
// Sheet
// ---------------------------------------------------------------------------

/**
 * Bottom sheet used for every add/edit flow.
 *
 * Delegates to the shared `Sheet`. The two defaults pinned here are what this
 * environment's forms have always had: a narrower panel, and centring on wider
 * screens rather than a full-height slab stuck to the bottom edge.
 */
export function Sheet({
  maxWidth = "sm:max-w-lg",
  ...props
}: React.ComponentProps<typeof SharedSheet>) {
  return <SharedSheet placement="auto" maxWidth={maxWidth} {...props} />;
}

/**
 * Full-width primary and destructive buttons, delegating to the shared
 * `Button`. Kept as named wrappers because ~30 call sites read better as
 * `<PrimaryButton>` than as four props, and because they pin the full-width,
 * large, `rounded-ios` shape this environment's forms expect.
 *
 * The prop cast is deliberate: `Button` is a `motion.button`, whose drag and
 * animation handlers collide with the plain `ButtonHTMLAttributes` these
 * wrappers accept. Nothing here forwards those handlers.
 */
export function PrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      variant="primary"
      size="lg"
      fullWidth
      className={cn("rounded-ios shadow-none", className)}
      {...(props as ButtonProps)}
    >
      {children}
    </Button>
  );
}

export function DangerButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      variant="destructive"
      size="md"
      fullWidth
      className={cn("rounded-ios", className)}
      {...(props as ButtonProps)}
    >
      {children}
    </Button>
  );
}

/** Confirm-then-act, for deletes. Two taps, no dialog library. */
export function ConfirmButton({
  onConfirm,
  idleLabel,
  confirmLabel,
}: {
  onConfirm: () => void;
  idleLabel: string;
  confirmLabel: string;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <DangerButton
      onClick={() => {
        if (armed) onConfirm();
        else setArmed(true);
      }}
    >
      {armed ? confirmLabel : idleLabel}
    </DangerButton>
  );
}

// ---------------------------------------------------------------------------
// Category helpers
// ---------------------------------------------------------------------------

/**
 * The coloured disc a category/account/goal is identified by.
 *
 * Falls back through icon → emoji → first letter, so records created before
 * the icon set existed still render sensibly.
 */
export function CategoryDot({
  colour,
  size = 34,
  label,
  emoji,
  iconName,
}: {
  colour?: string | null;
  size?: number;
  label?: string;
  emoji?: string | null;
  iconName?: string | null;
}) {
  // Flagged by `react-hooks/static-components`, and a false positive for the
  // same reason as in `icon-picker.tsx`: `getIcon` reads a module-level Map, so
  // the reference is stable per icon name and nothing remounts.
  // eslint-disable-next-line react-hooks/static-components
  const Icon = getIcon(iconName);

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: colour ?? "#8E8E93",
        fontSize: size * 0.42,
      }}
      aria-hidden
    >
      {Icon ? (
        // eslint-disable-next-line react-hooks/static-components
        <Icon size={size * 0.55} weight="fill" />
      ) : (
        emoji || (label ? label.slice(0, 1).toUpperCase() : "")
      )}
    </span>
  );
}

/** Group a list by day for the transaction list's date headers. */
export function useGroupedByDay<T extends { dateCreated: string }>(items: T[]) {
  return useMemo(() => {
    const groups = new Map<string, T[]>();
    for (const item of items) {
      const d = new Date(item.dateCreated);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);
}

export function formatDayHeading(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(date, today)) return "Today";
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}
