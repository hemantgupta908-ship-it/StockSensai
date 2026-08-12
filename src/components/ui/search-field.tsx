"use client";

import { MagnifyingGlass, X } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

/** Filter input with a leading glass and a clear button once it has content. */
export function SearchField({
  value,
  onChange,
  placeholder = "Search...",
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div className={cn("relative mb-3", className)}>
      <MagnifyingGlass
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-secondary/40"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        // The placeholder is the only visible label on this control, so it
        // needs an accessible name of its own.
        aria-label={ariaLabel ?? placeholder}
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
