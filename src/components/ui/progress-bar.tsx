"use client";

import { cn } from "@/lib/utils";

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
  label,
}: {
  percent: number;
  colour?: string | null;
  height?: number;
  className?: string;
  /** Accessible name, for bars that aren't adjacent to their own heading. */
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(percent) ? percent : 0));
  const over = percent > 1;

  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-fill/15", className)}
      style={{ height }}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round((Number.isFinite(percent) ? percent : 0) * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-ios"
        style={{
          width: `${clamped * 100}%`,
          backgroundColor: over ? "rgb(var(--sys-red))" : (colour ?? "var(--accent)"),
        }}
      />
    </div>
  );
}
