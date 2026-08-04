import { cn } from "@/lib/utils";

/**
 * iOS grouped-list card: generous corner radius, hairline border and a shadow
 * soft enough to read as elevation rather than a drop shadow.
 */
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-card bg-bg-secondary",
        "border border-separator/40 dark:border-white/[0.06]",
        "shadow-card dark:shadow-card-dark",
        className,
      )}
      {...props}
    >
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
