"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowClockwise, House, WarningCircle } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary.
 *
 * Without one, anything thrown while rendering a screen — a market-data
 * provider failing mid-screen, a malformed cached payload — renders Next's bare
 * production error page with no way back. That matters more than usual here:
 * the data layer talks to an undocumented upstream feed that can and does
 * change shape without notice.
 *
 * `reset()` re-renders the segment, which is genuinely useful for a transient
 * fetch failure; the Home link is the escape hatch when it isn't transient.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route error]", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber/15 text-amber">
        <WarningCircle size={28} />
      </div>

      <h1 className="mt-5 text-title2 font-bold tracking-tight text-label">
        This screen didn&apos;t load
      </h1>
      <p className="mt-2 max-w-sm text-subhead leading-relaxed text-label-secondary/70">
        Something went wrong while putting this page together. Your data is safe — nothing was
        saved or changed.
      </p>

      {error.digest ? (
        <p className="mt-3 font-mono text-caption2 text-label-secondary/50">
          Reference: {error.digest}
        </p>
      ) : null}

      <div className="mt-7 flex flex-col items-stretch gap-2.5 sm:flex-row">
        <Button onClick={reset} size="lg">
          <ArrowClockwise size={17} />
          Try again
        </Button>
        {/* A plain link, not a <Button> — `Button` renders a <button>, and an
            anchor inside one is invalid and unnavigable. */}
        <Link
          href="/home"
          className="inline-flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-fill/[0.12] px-6 text-body font-semibold text-label transition-colors active:bg-fill/[0.2] dark:bg-white/[0.10] dark:active:bg-white/[0.16]"
        >
          <House size={17} />
          Go to Home
        </Link>
      </div>
    </main>
  );
}
