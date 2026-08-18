import "server-only";

import {
  getMarketDataProvider,
  getStockBundle,
  getUniverseBundles,
} from "@/lib/market-data";
import { TRADING_STYLES, type RiskTolerance, type TradingStyle } from "@/lib/strategies/types";
import { buildFeed, buildStockAnalysis, type StrategyRecord } from "./analysis";
import type { RecommendationFeed } from "./types";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * The server's recommendation engine.
 *
 * The ranking itself lives in `./analysis`, which is pure and shared with the
 * Android build. This module supplies the three things that are genuinely
 * server-side: the configured market-data provider, the fetched universe, and
 * the realised track records held in Supabase.
 */

export { evaluateAllStrategies } from "./analysis";
export type { StockAnalysis } from "./analysis";

/**
 * Realised track record per strategy, keyed by strategy id.
 *
 * Shared by the feed and the stock detail screen so the same setup never shows
 * one confidence on a card and a different one on the page it links to.
 */
async function fetchStrategyRecords(): Promise<Map<string, StrategyRecord>> {
  const records = new Map<string, StrategyRecord>();
  try {
    const supabase = getSupabaseAdminClient();
    if (!supabase) return records;

    const { data } = await supabase
      .from("strategy_performance")
      .select("strategy_id, win_rate, total_trades");

    for (const row of data ?? []) {
      records.set(row.strategy_id, {
        winRate: Number(row.win_rate),
        totalTrades: Number(row.total_trades),
      });
    }
  } catch {
    // Track records are an optional enhancement — a feed without them is still
    // correct, just untilted.
  }
  return records;
}

/** Build the recommendation feed for one trading style. */
export async function generateFeed(
  style: TradingStyle,
  tolerance: RiskTolerance = "moderate",
): Promise<RecommendationFeed> {
  const provider = getMarketDataProvider();
  const [bundles, records] = await Promise.all([getUniverseBundles(), fetchStrategyRecords()]);
  return buildFeed(bundles, style, tolerance, records, provider);
}

/** Everything the stock detail screen needs. */
export async function analyseStock(ticker: string, tolerance: RiskTolerance = "moderate") {
  const bundle = await getStockBundle(ticker);
  if (!bundle) return null;

  const provider = getMarketDataProvider();
  const records = await fetchStrategyRecords();
  return buildStockAnalysis(bundle, tolerance, records, provider);
}

/**
 * Recommendations across every trading style — used by the daily cron job that
 * populates the Supabase cache.
 */
export async function generateAllFeeds(
  tolerance: RiskTolerance = "moderate",
): Promise<RecommendationFeed[]> {
  return Promise.all(TRADING_STYLES.map((style) => generateFeed(style, tolerance)));
}
