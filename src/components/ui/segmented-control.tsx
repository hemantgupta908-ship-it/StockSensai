"use client";

import { motion, LayoutGroup } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional second line, e.g. the hold period for a trading style. */
  caption?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  /**
   * Fit five-ish options into the width instead of letting them overflow.
   *
   * The obvious alternative — a sideways scroller — was worse on a phone: the
   * last option sat half off the screen edge, which reads as a broken layout
   * rather than as an invitation to swipe, and a style you cannot see is a
   * style you never try. Shrinking the type instead keeps every option on
   * screen at once; the labels are short enough to survive it, and they grow
   * back to full size as soon as there is room.
   */
  fit?: boolean;
}

/**
 * UISegmentedControl equivalent.
 *
 * The sliding indicator is a shared `layoutId` rather than an animated `left`
 * offset, so it interpolates position *and* width in one spring and stays
 * correct when the container resizes.
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

  const padding = size === "sm" ? "p-[2px]" : "p-[3px]";
  const itemHeight =
    size === "sm" ? "h-8" : size === "lg" ? (fit ? "h-[50px] sm:h-[54px]" : "h-14") : "h-10";
  const textSize = size === "sm" ? "text-footnote" : "text-subhead";

  return (
    <LayoutGroup id={groupId}>
      <div
        role="tablist"
        className={cn(
          "relative flex w-full rounded-[12px] bg-fill/[0.10] dark:bg-white/[0.07]",
          padding,
          className,
        )}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center rounded-[10px]",
                "font-semibold transition-colors duration-200",
                fit ? "px-0.5" : textSize,
                itemHeight,
                selected ? "text-label" : "text-label-secondary/60",
              )}
            >
              {selected && (
                <motion.span
                  layoutId={`segmented-indicator-${groupId}`}
                  className={cn(
                    "absolute inset-0 -z-10 rounded-[10px] bg-bg-secondary",
                    "shadow-pill dark:bg-[rgb(58_58_60)]",
                  )}
                  transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.8 }}
                />
              )}
              <span
                className={cn(
                  "relative w-full truncate text-center",
                  // Small enough that the longest label ("Positional") clears
                  // a 375px screen, restored at the first breakpoint with room.
                  fit &&
                    "text-[10.5px] leading-[13px] tracking-[-0.02em] sm:text-subhead sm:tracking-normal",
                )}
              >
                {option.label}
              </span>
              {option.caption && (
                <span
                  className={cn(
                    "relative mt-0.5 w-full truncate text-center font-medium",
                    fit ? "text-[9px] leading-[11px] sm:text-caption2" : "text-caption2",
                    selected ? "text-label-secondary/70" : "text-label-secondary/45",
                  )}
                >
                  {option.caption}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
