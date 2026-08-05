"use client";

/**
 * Shared presentation pieces for the budget environment.
 *
 * Kept in one file because they are small, mutually related, and used by nearly
 * every budget screen — splitting them would be more imports than substance.
 */

import Link from "next/link";
import React, { useMemo, useState, useRef, useEffect, Children, isValidElement } from "react";
import { ChevronLeft, Plus, Search, X, ChevronDown, Check, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { CONTAINER_WIDTHS, type ContainerWidth } from "@/components/ui/page-container";
import { formatCurrencyAmount } from "@/lib/budget/currency";
import { getIcon } from "@/lib/budget/icons";
import { useBudget } from "./budget-provider";
import { EnvironmentSwitcherCompact } from "@/components/ui/environment-switcher";

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
  title: string;
  subtitle?: string;
  backHref?: string;
  action?: React.ReactNode;
  large?: boolean;
  width?: ContainerWidth;
}) {
  return (
    <header className="sticky top-0 z-30 material hairline-b safe-top">
      <div className={cn("mx-auto flex items-center gap-2 py-3", CONTAINER_WIDTHS[width])}>
        {backHref ? (
          <Link
            href={backHref}
            className="-ml-2 flex items-center gap-0.5 rounded-full p-1.5 text-green transition-colors hover:bg-fill/10"
            aria-label="Back"
          >
            <ChevronLeft size={22} strokeWidth={2.4} />
          </Link>
        ) : null}

        <div className="min-w-0 flex-1">
          <h1
            className={cn(
              "truncate font-semibold tracking-tight text-label",
              large ? "text-title1" : "text-headline",
            )}
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-caption text-label-secondary/60">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {action}
          {/* Below `lg` there is no sidebar, so the crossing point lives here. */}
          {!backHref ? (
            <span className="lg:hidden">
              <EnvironmentSwitcherCompact active="budget" />
            </span>
          ) : null}
        </div>
      </div>
    </header>
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
    "block rounded-card bg-bg-secondary p-4 shadow-card dark:shadow-card-dark",
    (onClick || href) && "text-left transition-transform active:scale-[0.99]",
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
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-card bg-bg-secondary px-6 py-12 text-center">
      <Icon size={34} className="mb-3 text-label-secondary/30" strokeWidth={1.6} />
      <p className="text-headline text-label">{title}</p>
      {description ? (
        <p className="mt-1 max-w-xs text-subhead text-label-secondary/60">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Floating add button, matching the position Cashew uses. */
export function AddFab({ onClick, label = "Add" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="fixed bottom-[80px] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-green text-white shadow-pill transition-transform active:scale-95 lg:bottom-8 lg:right-8"
    >
      <Plus size={26} strokeWidth={2.4} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Renders an amount in the primary currency.
 *
 * Honours the environment's "hide amounts" setting by blurring rather than
 * removing, so layout does not shift when it is toggled.
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
  });

  return (
    <span
      className={cn(
        "tabular-nums",
        colour && (value > 0 ? "text-green" : value < 0 ? "text-red" : "text-label"),
        settings.hideAmounts && "blur-[6px] transition-[filter] hover:blur-none",
        className,
      )}
    >
      {text}
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
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-secondary/40"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-ios bg-fill/10 py-2.5 pl-9 pr-9 text-subhead text-label outline-none placeholder:text-label-secondary/40 focus:ring-2 focus:ring-green/40"
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
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-footnote font-medium text-label-secondary">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-caption text-label-secondary/50">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-ios border border-separator/50 bg-bg-elevated px-3 py-2.5 text-body text-label outline-none focus:border-green focus:ring-2 focus:ring-green/25";

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
  const options: { value: string; label: string }[] = [];
  let selectedLabel = props.value as string;

  Children.forEach(props.children, (child) => {
    if (isValidElement(child) && child.type === "option") {
      const element = child as React.ReactElement<any>;
      const val = element.props.value;
      const label = element.props.children;
      options.push({ value: val as string, label: label as string });
      if (val === props.value) {
        selectedLabel = label as string;
      }
    }
  });

  return (
    <div className={cn("relative w-full", props.className)} ref={containerRef}>
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
        <ChevronDown size={16} className="shrink-0 text-label-secondary/50" />
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
              {options.map((opt) => (
                <button
                  key={opt.value}
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
              ))}
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
          checked ? "bg-green" : "bg-fill/25",
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
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
      />
      <div className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-sheet bg-bg-elevated shadow-sheet animate-sheet-in sm:max-w-lg sm:rounded-sheet">
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
          <div className="border-t border-separator/50 px-4 py-3 safe-bottom">{footer}</div>
        ) : null}
      </div>
    </div>
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
        <Icon size={size * 0.55} strokeWidth={2.1} />
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
