import { NextResponse } from "next/server";

import { cronSecret } from "@/lib/env";
import { generateFeed } from "@/lib/engine/recommend";
import { invalidateFeedCache } from "@/lib/engine/cache";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { RiskTolerance, TradingStyle } from "@/lib/strategies/types";

export const dynamic = "force-dynamic";
/** Screening the universe across 3 styles x 3 tolerances needs headroom. */
export const maxDuration = 300;

const STYLES: TradingStyle[] = ["swing", "short-term", "long-term"];
const TOLERANCES: RiskTolerance[] = ["conservative", "moderate", "aggressive"];

/**
 * Daily recompute.
 *
 * Wired to Vercel Cron (see vercel.json). Regenerates every feed and writes the
 * results to `cached_recommendations` so page loads read a table instead of
 * re-running the whole strategy engine.
 *
 * When Supabase isn't configured this still runs and warms the in-process
 * cache, which is the useful behaviour in demo mode.
 */
export async function GET(request: Request) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. If no secret is
  // configured we only allow the request when it carries Vercel's cron header,
  // so the endpoint is never openly triggerable in production.
  const authHeader = request.headers.get("authorization");
  const isVercelCron = request.headers.get("x-vercel-cron") !== null;

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production" && !isVercelCron) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 401 },
    );
  }

  const startedAt = Date.now();

  try {
    invalidateFeedCache();

    const feeds = await Promise.all(
      TOLERANCES.flatMap((tolerance) =>
        STYLES.map(async (style) => ({
          tolerance,
          style,
          feed: await generateFeed(style, tolerance),
        })),
      ),
    );

    const totalRecommendations = feeds.reduce((sum, f) => sum + f.feed.recommendations.length, 0);
    const supabase = getSupabaseAdminClient();

    if (!supabase) {
      return NextResponse.json({
        ok: true,
        persisted: false,
        reason: "Supabase service-role key not configured — in-process cache warmed only",
        feeds: feeds.length,
        recommendations: totalRecommendations,
        durationMs: Date.now() - startedAt,
      });
    }

    const rows = feeds.flatMap(({ tolerance, feed }) =>
      feed.recommendations.map((r) => ({
        stock_ticker: r.ticker,
        strategy_id: r.strategyId,
        trading_style: r.tradingStyle,
        risk_tolerance: tolerance,
        buy_range_low: r.buyRange.low,
        buy_range_high: r.buyRange.high,
        sell_range_low: r.sellRange.low,
        sell_range_high: r.sellRange.high,
        stop_loss: r.stopLoss,
        // The table stores a single figure; the range lives in the payload.
        estimated_hold_days: r.estimatedHoldDays.max,
        confidence_score: r.confidenceScore,
        risk_level: r.riskLevel,
        direction: r.direction,
        reason: r.reason,
        payload: r as unknown,
        generated_at: r.generatedAt,
      })),
    );

    // Clear out anything from the previous run that no longer qualifies,
    // otherwise stale setups linger in the cache indefinitely.
    const { error: deleteError } = await supabase
      .from("cached_recommendations")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (deleteError) throw new Error(`Clear failed: ${deleteError.message}`);

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from("cached_recommendations")
        .upsert(rows, { onConflict: "stock_ticker,strategy_id,risk_tolerance" });
      if (insertError) throw new Error(`Write failed: ${insertError.message}`);
    }

    return NextResponse.json({
      ok: true,
      persisted: true,
      feeds: feeds.length,
      recommendations: rows.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[cron/recompute] failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
