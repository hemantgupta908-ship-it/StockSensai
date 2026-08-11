"use client";

/**
 * Shared presentation pieces for the budget environment.
 *
 * Kept in one file because they are small, mutually related, and used by nearly
 * every budget screen — splitting them would be more imports than substance.
 */

import Link from "next/link";
import React, { useMemo, useState, useRef, useEffect, Children, isValidElement } from "react";
import { createPortal } from "react-dom";
import { CaretDown, CaretLeft, Check, Icon, List, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { CONTAINER_WIDTHS, type ContainerWidth } from "@/components/ui/page-container";
import { formatCurrencyAmount } from "@/lib/budget/currency";
import { getIcon } from "@/lib/budget/icons";
import { useBudget } from "./budget-provider";
import { EnvironmentSwitcherCompact } from "@/components/ui/environment-switcher";
import { BudgetMobileSidebar } from "./budget-nav";

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

  return (
    <>
      <header className="sticky top-0 z-30 material hairline-b safe-top">
      <div className={cn("mx-auto flex items-center gap-2 py-3", CONTAINER_WIDTHS[width])}>
        {/* Below `lg` render hamburger menu button on all pages */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-lg text-label transition-colors hover:bg-fill/[0.12] lg:hidden focus:outline-none"
          aria-label="Open menu"
        >
          <div className="flex w-[18px] flex-col gap-[4px]">
            <span className="h-[2px] w-full rounded-full bg-current" />
            <span className="h-[2px] w-full rounded-full bg-current" />
            <span className="h-[2px] w-full rounded-full bg-current" />
          </div>
        </button>

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
      <BudgetMobileSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
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

export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-6", className)}>
      {title ? (
        <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
          <h2 className="text-footnote font-semibold uppercase tracking-wide text-label-secondary/60">
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Card({
  children,
  className,
  onClick,
  href,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  href?: string;
}) {
  const classes = cn(
    "block rounded-card bg-bg-secondary p-4 shadow-card dark:shadow-card-dark transition-all duration-200 ease-out",
    (onClick || href) && "text-left cursor-pointer hover:shadow-lg active:scale-[0.98]",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(classes, "w-full")}>
        {children}
      </button>
    );
  }
  return <div className={classes}>{children}</div>;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: Icon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-card bg-bg-secondary px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-fill/10 text-label-secondary">
        <Icon size={24} />
      </div>
      <h3 className="text-headline font-semibold text-label">{title}</h3>
      {description ? (
        <p className="mt-1 text-footnote text-label-secondary/60">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function AnimatedNumberTicker({ value, className }: { value: number; className?: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={value}
        initial={{ opacity: 0.6, y: 3, filter: "blur(2px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0.6, y: -3, filter: "blur(2px)" }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className={className}
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
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
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-pill hover:shadow-xl transition-shadow"
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
}: {
  value: number;
  currency?: string | null;
  className?: string;
  showSign?: boolean;
  /** Tint green for positive, red for negative. */
  colour?: boolean;
  decimals?: number;
  compact?: boolean;
}) {
  const { allWallets, settings } = useBudget();
  const code = currency ?? allWallets.primaryCurrency;
  const text = formatCurrencyAmount(value, code, {
    showSign,
    compact,
    decimals: decimals ?? (settings.showDecimals ? undefined : 0),
    obfuscate: settings.hideAmounts,
  });

  return (
    <span
      className={cn(
        "inline-flex items-center tabular-nums transition-colors duration-300 ease-out",
        colour && (value > 0 ? "text-green" : value < 0 ? "text-red" : "text-label"),
        settings.hideAmounts && "font-mono tracking-widest text-label-secondary/50 select-none",
        className,
      )}
    >
      <AnimatedNumberTicker value={text as any} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * Budget/goal progress bar.
 *
 * Overspend is shown by turning the bar red and capping the fill at 100% —
 * Cashew's treatment, which keeps the bar readable past the limit.
 */
export function ProgressBar({
  percent,
  colour,
  height = 10,
  className,
}: {
  percent: number;
  colour?: string | null;
  height?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(percent) ? percent : 0));
  const over = percent > 1;

  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-fill/15", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(percent * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-ios"
        style={{
          width: `${clamped * 100}%`,
          backgroundColor: over ? "rgb(var(--sys-red))" : (colour ?? "var(--budget-accent)"),
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export function SearchField({
  value,
  onChange,
  placeholder = "Search...",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative mb-3">
      <MagnifyingGlass
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-secondary/40"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-ios bg-fill/10 py-2.5 pl-9 pr-9 text-subhead text-label outline-none placeholder:text-label-secondary/40 focus:ring-2 focus:ring-accent/40"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-label-secondary/50 hover:bg-fill/15"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cn("block mb-3", className)}>
      <span className="mb-1 block px-1 text-[11px] font-semibold uppercase tracking-wider text-label-secondary/50">{label}</span>
      {children}
      {hint ? <span className="mt-1 block px-1 text-caption text-label-secondary/40">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-[14px] bg-fill/5 px-3.5 py-2.5 text-body text-label outline-none transition-all placeholder:text-label-secondary/30 focus:bg-fill/10 focus:ring-2 focus:ring-accent/20";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Parse children into an array of options
  const options: { value: string; label: string; group?: string }[] = [];
  let selectedLabel = props.value as string;

  Children.forEach(props.children, (child) => {
    if (!isValidElement(child)) return;

    if (child.type === "option") {
      const element = child as React.ReactElement<any>;
      const val = element.props.value;
      const label = element.props.children;
      options.push({ value: val as string, label: label as string });
      if (val === props.value) {
        selectedLabel = label as string;
      }
    } else if (child.type === "optgroup") {
      const groupElement = child as React.ReactElement<any>;
      const groupLabel = groupElement.props.label;
      Children.forEach(groupElement.props.children, (groupChild) => {
        if (isValidElement(groupChild) && groupChild.type === "option") {
          const element = groupChild as React.ReactElement<any>;
          const val = element.props.value;
          const label = element.props.children;
          options.push({ value: val as string, label: label as string, group: groupLabel });
          if (val === props.value) {
            selectedLabel = label as string;
          }
        }
      });
    }
  });

  return (
    <div className={cn("relative w-full", open && "z-50", props.className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          inputClass,
          "flex w-full items-center justify-between text-left transition-colors",
          open && "border-green ring-2 ring-green/25",
        )}
      >
        <span className="truncate">{selectedLabel || "Select..."}</span>
        <CaretDown size={16} className="shrink-0 text-label-secondary/50" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-50 mt-2 w-full overflow-hidden rounded-[16px] bg-bg-secondary p-1.5 shadow-lg ring-1 ring-black/5 dark:ring-white/10"
          >
            <div className="max-h-60 overflow-y-auto space-y-0.5">
              {options.map((opt, i) => {
                const showGroup = opt.group && (i === 0 || options[i - 1].group !== opt.group);
                return (
                  <React.Fragment key={opt.value}>
                    {showGroup && (
                      <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-label-secondary/50">
                        {opt.group}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (props.onChange) {
                          const event = {
                            target: { value: opt.value },
                            currentTarget: { value: opt.value },
                          } as React.ChangeEvent<HTMLSelectElement>;
                          props.onChange(event);
                        }
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left text-body transition-colors hover:bg-fill/10",
                        props.value === opt.value ? "text-green font-medium" : "text-label"
                      )}
                    >
                      <span className="truncate">{opt.label}</span>
                      {props.value === opt.value && <Check size={16} className="shrink-0 text-green" />}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-2.5 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-subhead text-label">{label}</span>
        {description ? (
          <span className="block text-caption text-label-secondary/60">{description}</span>
        ) : null}
      </span>
      <span
        className={cn(
          "relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-accent" : "bg-fill/25",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform duration-200 ease-ios",
            checked ? "translate-x-[22px]" : "translate-x-[2px]",
          )}
        />
      </span>
    </button>
  );
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex rounded-ios bg-fill/10 p-0.5", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 rounded-[8px] px-3 py-1.5 text-footnote font-medium transition-colors",
            value === option.value
              ? "bg-bg-elevated text-label shadow-sm"
              : "text-label-secondary/60",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sheet
// ---------------------------------------------------------------------------

/** Bottom sheet used for every add/edit flow. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = "sm:max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
      />
      <div className={cn("relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-sheet bg-bg-elevated shadow-sheet animate-sheet-in sm:rounded-sheet", maxWidth)}>
        <div className="flex items-center justify-between border-b border-separator/50 px-4 py-3">
          <h2 className="text-headline text-label">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-label-secondary/60 hover:bg-fill/15"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-separator/50 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

export function PrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "w-full rounded-ios bg-green py-3 text-headline font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function DangerButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "w-full rounded-ios bg-red/10 py-2.5 text-subhead font-semibold text-red transition-colors hover:bg-red/15",
        className,
      )}
    >
      {children}
    </button>
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
