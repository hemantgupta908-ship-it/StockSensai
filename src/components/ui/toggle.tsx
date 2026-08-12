"use client";

import { cn } from "@/lib/utils";

/** iOS-style switch with a label and optional supporting line. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  size = "sm",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  size?: "sm" | "md";
}) {
  const isSm = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-3 text-left",
        isSm ? "py-1.5" : "py-2.5",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cn("block text-label", isSm ? "text-footnote font-medium" : "text-subhead")}>
          {label}
        </span>
        {description ? (
          <span className="block text-caption2 text-label-secondary/60 leading-tight">{description}</span>
        ) : null}
      </span>
      <span
        className={cn(
          "relative shrink-0 rounded-full transition-colors duration-200",
          isSm ? "h-[24px] w-[42px]" : "h-[31px] w-[51px]",
          checked ? "bg-accent" : "bg-fill/25 dark:bg-white/20",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-ios",
            isSm ? "h-[20px] w-[20px]" : "h-[27px] w-[27px]",
            checked ? (isSm ? "translate-x-[18px]" : "translate-x-[22px]") : "translate-x-[2px]",
          )}
        />
      </span>
    </button>
  );
}
