"use client";

import { cn } from "@/lib/utils";

/**
 * Labelled form field, and the input that usually sits inside it.
 *
 * Promoted out of the budget environment — nothing about a label above a
 * control is budget-specific, and the stock side had no equivalent, which is
 * why its forms ended up with placeholder-only inputs.
 */

/**
 * A label and its control.
 *
 * Renders a `<label>` by default, which associates the text with a single
 * control implicitly and needs no `id` plumbing at ~180 call sites. Pass
 * `group` when the children are several controls rather than one — a `<label>`
 * wrapping eighteen swatch buttons is not a label, and assistive technology
 * reads it as one enormous control.
 */
export function Field({
  label,
  children,
  hint,
  className,
  group = false,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
  /** The children are a set of controls, not one. Renders a labelled group. */
  group?: boolean;
}) {
  const caption = (
    <span className="mb-1 block px-1 text-[11px] font-semibold uppercase tracking-wider text-label-secondary/50">
      {label}
    </span>
  );
  const help = hint ? (
    <span className="mt-1 block px-1 text-caption text-label-secondary/40">{hint}</span>
  ) : null;

  if (group) {
    return (
      <div className={cn("mb-3 block", className)} role="group" aria-label={label}>
        {caption}
        {children}
        {help}
      </div>
    );
  }

  return (
    <label className={cn("mb-3 block", className)}>
      {caption}
      {children}
      {help}
    </label>
  );
}

export const inputClass =
  "w-full rounded-[14px] bg-fill/5 px-3.5 py-2.5 text-body text-label outline-none transition-all placeholder:text-label-secondary/30 focus:bg-fill/10 focus:ring-2 focus:ring-accent/20";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}
