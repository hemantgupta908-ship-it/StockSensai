import { cn } from "@/lib/utils";

/**
 * A titled block of page content, with an optional action on the title row.
 *
 * Distinct from `SectionLabel` in `card.tsx`, despite the similar name: that is
 * a bare heading padded to line up with a grouped card's content, whereas this
 * is the surrounding layout — spacing, the heading, and somewhere to hang an
 * "Edit" or "See all" control.
 */
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
