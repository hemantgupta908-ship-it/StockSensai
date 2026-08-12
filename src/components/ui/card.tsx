import Link from "next/link";

import { cn } from "@/lib/utils";

interface CardProps extends Omit<React.HTMLAttributes<HTMLElement>, "onClick"> {
  /** Renders the card as a link. */
  href?: string;
  /**
   * Renders the card as a button. Typed loosely rather than to `HTMLDivElement`
   * because the element this lands on depends on which of `href`/`onClick` was
   * given — no call site passes the event through.
   */
  onClick?: () => void;
  /**
   * The hairline border. On by default — the budget environment's cards were
   * borderless and pass `false`, which is a look rather than an oversight.
   */
  bordered?: boolean;
}

/**
 * iOS grouped-list card: generous corner radius, hairline border and a shadow
 * soft enough to read as elevation rather than a drop shadow.
 *
 * Renders a `<div>`, an `<a>` or a `<button>` depending on whether it was given
 * somewhere to go. A card you can tap has to be a real control — the budget
 * side got this right and the shared one had no equivalent, so the behaviour
 * came up rather than the markup coming down.
 *
 * Padding is deliberately not baked in: the stock side composes `CardHeader` /
 * `CardContent` inside, while the budget side wants a flat `p-4`.
 */
export function Card({ className, children, href, onClick, bordered = true, ...props }: CardProps) {
  const classes = cn(
    "rounded-card bg-bg-secondary shadow-card dark:shadow-card-dark",
    bordered && "border border-separator/40 dark:border-white/[0.06]",
    (href || onClick) && "block cursor-pointer text-left hover:shadow-lg active:scale-[0.98]",
    className,
  );

  // `props` is spread onto every branch, not just the `div`. Forwarding it on
  // only one path meant `id`, `aria-*` and `data-*` were silently dropped from
  // exactly the cards that are interactive — the ones most likely to need them.
  if (href) {
    return (
      <Link href={href} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(classes, "w-full")} {...props}>
        {children}
      </button>
    );
  }

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-4 pt-4 pb-2", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-headline font-semibold tracking-tight text-label", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-4 pb-4", className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Section heading above a grouped card — uppercase, tertiary label colour,
 * the way iOS Settings labels its groups.
 *
 * Not the same thing as `Section`, despite the name: this is a bare heading
 * padded to line up with a card's contents, not a layout wrapper.
 */
export function SectionLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <h2
      className={cn(
        "px-4 pb-2 text-footnote font-medium uppercase tracking-wide text-label-secondary/60",
        className,
      )}
    >
      {children}
    </h2>
  );
}
