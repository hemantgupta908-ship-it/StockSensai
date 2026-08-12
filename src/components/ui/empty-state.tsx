import type { Icon } from "@phosphor-icons/react";

/** "Nothing here yet" panel, with an optional call to action. */
export function EmptyState({
  icon: IconComponent,
  title,
  description,
  action,
}: {
  icon: Icon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-card bg-bg-secondary px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-fill/10 text-label-secondary">
        <IconComponent size={24} aria-hidden />
      </div>
      <h3 className="text-headline font-semibold text-label">{title}</h3>
      {description ? (
        <p className="mt-1 text-footnote text-label-secondary/60">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
