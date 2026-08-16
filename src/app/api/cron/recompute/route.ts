import { NextResponse } from "next/server";

import { cronSecret } from "@/lib/env";
import { generateFeed } from "@/lib/engine/recommend";
import { invalidateFeedCache } from "@/lib/engine/cache";
import { getUniverseBundles, invalidateUniverseCache } from "@/lib/market-data";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { TRADING_STYLES, type RiskTolerance } from "@/lib/strategies/types";

export const dynamic = "force-dynamic";
/** Screening the universe across 5 styles x 3 tolerances needs headroom. */
export const maxDuration = 300;

const STYLES = TRADING_STYLES;
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
  /** Cut-off for retiring rows this run did not rewrite. */
  const startedAtIso = new Date(startedAt).toISOString();

  try {
    invalidateFeedCache();
    // Force a genuinely fresh screen: this job exists to refresh the durable
    // copy, so it must not rebuild it from a universe another request warmed.
    invalidateUniverseCache();

    // Fetch the universe once, up front, before any screening starts.
    //
    // The nine style/tolerance feeds all read the same bundles, and
    // `getUniverseBundles` de-duplicates concurrent callers — but only once one
    // of them is in flight. Firing all nine at the same instant means nine
    // callers arrive before any promise is registered, and the job pays for the
    // universe nine times over a rate-limited provider. Warming first collapses
    // that to one fetch; the screens that follow are pure computation and take
    // about three seconds for all nine combined.
    await getUniverseBundles();

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

    if (rows.length > 0) {
      // Write first, then retire what this run did not reproduce.
      //
      // Deliberately not delete-then-insert. Screening the Nifty 200 live takes
      // around four and a half minutes against a rate-limited provider, most of
      // a serverless invocation's budget, and the feed now *serves* from this
      // table. Clearing it up front means any timeout, throw or deploy landing
      // mid-run leaves an empty cache, and every reader falls back to a
      // four-minute live screen — the exact stall this table exists to prevent.
      // Writing first means the worst case is yesterday's rows surviving a day
      // longer, which the reader's own staleness check already handles.
      const { error: insertError } = await supabase
        .from("cached_recommendations")
        .upsert(rows, { onConflict: "stock_ticker,strategy_id,risk_tolerance" });
      if (insertError) throw new Error(`Write failed: ${insertError.message}`);

      // Anything not refreshed by this run no longer qualifies.
      const { error: deleteError } = await supabase
        .from("cached_recommendations")
        .delete()
        .lt("generated_at", startedAtIso);
      if (deleteError) throw new Error(`Retire failed: ${deleteError.message}`);

      // Auto-Evaluation engine: write to permanent history log.
      //
      // Paged, because an unbounded select is capped at PostgREST's max-rows
      // (1000 by default). A short read here does not fail loudly — it just
      // yields an incomplete pending set, and every setup missing from it gets
      // logged a second time, double-counting in the win rate.
      const PAGE_SIZE = 1000;
      const pendingSet = new Set<string>();

      for (let page = 0; ; page++) {
        const { data: pendingHistory, error: pendingError } = await supabase
          .from("recommendation_history")
          .select("stock_ticker, strategy_id")
          .eq("status", "pending")
          .order("id", { ascending: true })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

        if (pendingError) throw new Error(`Pending fetch failed: ${pendingError.message}`);
        if (!pendingHistory || pendingHistory.length === 0) break;

        for (const h of pendingHistory) {
          pendingSet.add(`${h.stock_ticker}-${h.strategy_id}`);
        }
        if (pendingHistory.length < PAGE_SIZE) break;
      }

      const uniqueNewRows = [];
      const seen = new Set();
      // One history row per strategy signal, scored against the *moderate*
      // bands. The three tolerances produce different entry, target and stop
      // levels for the same setup, so a win rate is only meaningful against one
      // of them — and whichever is chosen is the geometry the resulting rate
      // gets applied to across all three feeds. Moderate is the default the app
      // ships with and sits between the other two, so it is the least wrong
      // single choice. Taking whatever `rows` happened to yield first would
      // silently measure conservative's narrow targets instead.
      for (const row of rows.filter((r) => r.risk_tolerance === "moderate")) {
        const key = `${row.stock_ticker}-${row.strategy_id}`;
        if (!pendingSet.has(key) && !seen.has(key)) {
          seen.add(key);
          uniqueNewRows.push({
            stock_ticker: row.stock_ticker,
            strategy_id: row.strategy_id,
            trading_style: row.trading_style,
            risk_tolerance: row.risk_tolerance,
            buy_range_mid: (row.buy_range_low + row.buy_range_high) / 2,
            target_price: (row.sell_range_low + row.sell_range_high) / 2,
            stop_loss: row.stop_loss,
            estimated_hold_days: row.estimated_hold_days,
            status: "pending",
            generated_at: row.generated_at,
          });
        }
      }

      if (uniqueNewRows.length > 0) {
        await supabase.from("recommendation_history").insert(uniqueNewRows);
      }
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
