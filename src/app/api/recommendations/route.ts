import { NextResponse } from "next/server";
import { z } from "zod";

import { getCachedFeed } from "@/lib/engine/cache";
import { TRADING_STYLES } from "@/lib/strategies/types";

export const dynamic = "force-dynamic";
/**
 * A cold screen against a live provider fetches history for the whole universe,
 * which comfortably exceeds the default serverless timeout.
 */
export const maxDuration = 120;

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

  try {
    const feed = await getCachedFeed(style, tolerance, { force: refresh === "1" });
    return NextResponse.json(feed, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[api/recommendations] failed:", error);
    return NextResponse.json({ error: "Failed to generate recommendations" }, { status: 500 });
  }
}
