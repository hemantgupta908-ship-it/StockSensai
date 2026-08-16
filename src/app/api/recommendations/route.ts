import { NextResponse } from "next/server";
import { z } from "zod";

import { getCachedFeed } from "@/lib/engine/cache";
import { callerKey, checkRateLimit } from "@/lib/api-rate-limit";
import { TRADING_STYLES } from "@/lib/strategies/types";

export const dynamic = "force-dynamic";
/**
 * A cold screen against a live provider fetches history for the whole universe,
 * which comfortably exceeds the default serverless timeout.
 */
export const maxDuration = 120;

/**
 * Ceiling on forced screens per caller.
 *
 * Three a minute is well above what pull-to-refresh produces in normal use —
 * the feed only changes when the cron rewrites it — while stopping a loop from
 * keeping a full universe screen permanently in flight.
 */
const REFRESH_LIMIT = 3;
const REFRESH_WINDOW_MS = 60_000;

const querySchema = z.object({
  // Derived from TRADING_STYLES so a style the engine knows about can never be
  // rejected at the edge.
  style: z.enum(TRADING_STYLES).default("swing"),
  tolerance: z.enum(["conservative", "moderate", "aggressive"]).default("moderate"),
  /** Set by pull-to-refresh to bypass the in-process cache. */
  refresh: z.enum(["0", "1"]).default("0"),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    style: url.searchParams.get("style") ?? undefined,
    tolerance: url.searchParams.get("tolerance") ?? undefined,
    refresh: url.searchParams.get("refresh") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { style, tolerance, refresh } = parsed.data;

  // Only the forced path is metered. An ordinary read is served from the cache
  // or the durable table and costs almost nothing, so limiting it would only
  // break the app for someone switching styles quickly.
  if (refresh === "1") {
    const { allowed, retryAfterSeconds } = checkRateLimit(`recommendations:${callerKey(request)}`, {
      limit: REFRESH_LIMIT,
      windowMs: REFRESH_WINDOW_MS,
    });

    if (!allowed) {
      return NextResponse.json(
        {
          error: "Too many refreshes",
          detail: `A full screen is expensive. Try again in ${retryAfterSeconds}s.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
            "Cache-Control": "no-store",
          },
        },
      );
    }
  }

  try {
    const feed = await getCachedFeed(style, tolerance, { force: refresh === "1" });
    return NextResponse.json(feed, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("[api/recommendations] failed:", error);
    return NextResponse.json({ error: "Failed to generate recommendations" }, { status: 500 });
  }
}
