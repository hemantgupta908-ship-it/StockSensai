export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded-lg bg-fill/10" />
        <div className="h-9 w-9 rounded-full bg-fill/10" />
      </div>

      {/* Hero card skeleton */}
      <div className="h-48 w-full rounded-2xl bg-fill/10" />

      {/* Grid cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-32 rounded-2xl bg-fill/10" />
        <div className="h-32 rounded-2xl bg-fill/10" />
        <div className="h-32 rounded-2xl bg-fill/10" />
      </div>
    </div>
  );
}
