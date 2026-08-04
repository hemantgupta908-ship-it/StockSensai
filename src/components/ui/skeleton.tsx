import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-fill/[0.12] animate-pulse dark:bg-white/[0.09]",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer",
        "after:bg-gradient-to-r after:from-transparent after:via-white/[0.15] after:to-transparent",
        className,
      )}
    />
  );
}

/** Placeholder matching the recommendation card's silhouette. */
export function RecommendationCardSkeleton() {
  return (
    <div className="animate-pulse rounded-card border border-separator/40 bg-bg-secondary p-4 shadow-card dark:border-white/[0.06] dark:shadow-card-dark">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-11 w-11 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
      <Skeleton className="mt-4 h-7 w-full rounded-full" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
    </div>
  );
}
