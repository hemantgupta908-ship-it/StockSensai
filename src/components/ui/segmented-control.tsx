"use client";

import { motion, LayoutGroup } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional second line, e.g. the hold period for a trading style. */
  caption?: string;
  /** Optional icon prefix */
  icon?: React.ReactNode;
  /** Optional badge pill (e.g., "25", "Live", "Strict") */
  badge?: string;
  /** Optional badge color class */
  badgeColor?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  /**
   * Fit five-ish options into the width instead of letting them overflow.
   */
  fit?: boolean;
}

/**
 * Modern Apple iOS 18 Glassmorphic Segmented Control with spring animation.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  fit = false,
}: SegmentedControlProps<T>) {
  const groupId = useId();

  const itemHeight =
    size === "sm" ? "h-8" : size === "lg" ? (fit ? "h-[50px] sm:h-[54px]" : "h-14") : "h-10";
  const textSize = size === "sm" ? "text-footnote" : "text-subhead";

  return (
    <LayoutGroup id={groupId}>
      <div
        role="tablist"
        className={cn(
          "relative flex w-full items-center rounded-[16px] bg-fill/[0.08] dark:bg-white/[0.06] border border-separator/40 dark:border-white/10 backdrop-blur-xl shadow-xs p-1",
          className,
        )}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <motion.button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={selected}
              whileTap={{ scale: 0.97 }}
              onClick={() => onChange(option.value)}
              className={cn(
                "relative z-10 flex min-w-0 flex-1 items-center justify-center gap-1.5 sm:gap-2 rounded-[12px] px-2 py-1.5",
                "font-semibold transition-all duration-200 select-none",
                fit ? "px-0.5" : textSize,
                itemHeight,
                selected
                  ? "text-label font-bold shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
                  : "text-label-secondary/70 hover:text-label",
              )}
            >
              {selected && (
                <motion.div
                  layoutId={`segmented-indicator-${groupId}`}
                  className="absolute inset-0 -z-10 rounded-[12px] bg-bg dark:bg-[#222226] ring-1 ring-black/5 dark:ring-white/15"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}

              {option.icon ? (
                <span className={cn("shrink-0 transition-colors", selected ? "text-accent" : "opacity-60")}>
                  {option.icon}
                </span>
              ) : null}

              <div className="min-w-0 truncate text-center flex flex-col items-center justify-center">
                <span
                  className={cn(
                    "truncate",
                    fit &&
                      "text-[10.5px] leading-[13px] tracking-[-0.02em] sm:text-subhead sm:tracking-normal",
                  )}
                >
                  {option.label}
                </span>
                {option.caption && (
                  <span
                    className={cn(
                      "mt-0.5 w-full truncate font-medium",
                      fit ? "text-[9px] leading-[11px] sm:text-caption2" : "text-caption2",
                      selected ? "text-label-secondary/75" : "text-label-secondary/50",
                    )}
                  >
                    {option.caption}
                  </span>
                )}
              </div>

              {option.badge ? (
                <span
                  className={cn(
                    "hidden sm:inline-block px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold leading-none shrink-0 transition-opacity",
                    selected
                      ? option.badgeColor || "bg-accent/15 text-accent"
                      : "bg-fill/10 text-label-secondary opacity-60",
                  )}
                >
                  {option.badge}
                </span>
              ) : null}
            </motion.button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
