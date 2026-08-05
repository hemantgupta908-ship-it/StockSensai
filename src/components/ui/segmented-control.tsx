"use client";

import { motion, LayoutGroup } from "framer-motion";
import { useEffect, useId, useRef } from "react";
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
   * Give each segment a floor width and let the control scroll sideways rather
   * than compressing. Past three or four options the equal-share layout squeezes
   * labels until they wrap mid-word on a phone, which reads far worse than a
   * scroll — and the selected segment is scrolled into view anyway.
   */
  scrollable?: boolean;
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
  scrollable = false,
}: SegmentedControlProps<T>) {
  const groupId = useId();
  const selectedRef = useRef<HTMLButtonElement>(null);

  const padding = size === "sm" ? "p-[2px]" : "p-[3px]";
  const itemHeight = size === "sm" ? "h-8" : size === "lg" ? "h-14" : "h-10";
  const textSize = size === "sm" ? "text-footnote" : "text-subhead";

  // Keep the active segment visible when the control overflows — on a phone the
  // last option can otherwise sit entirely off-screen after a reload.
  useEffect(() => {
    if (!scrollable) return;
    selectedRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [scrollable, value]);

  const control = (
    <div
      role="tablist"
      className={cn(
        "relative flex rounded-[12px] bg-fill/[0.10] dark:bg-white/[0.07]",
        scrollable ? "w-max min-w-full" : "w-full",
        padding,
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={selected ? selectedRef : undefined}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative z-10 flex flex-1 flex-col items-center justify-center rounded-[10px]",
              "font-semibold transition-colors duration-200",
              scrollable && "shrink-0 basis-[96px] px-2",
              itemHeight,
              textSize,
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
            <span className="relative whitespace-nowrap">{option.label}</span>
            {option.caption && (
              <span
                className={cn(
                  "relative mt-0.5 whitespace-nowrap text-caption2 font-medium",
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
  );

  return (
    <LayoutGroup id={groupId}>
      {scrollable ? (
        <div className="no-scrollbar -mx-1 overflow-x-auto px-1">{control}</div>
      ) : (
        control
      )}
    </LayoutGroup>
  );
}
