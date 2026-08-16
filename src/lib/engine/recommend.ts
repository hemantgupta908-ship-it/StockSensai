import "server-only";

import {
  getMarketDataProvider,
  getStockBundle,
  getUniverseBundles,
} from "@/lib/market-data";
import type { StockDataBundle } from "@/lib/market-data/types";
import { ALL_STRATEGIES, getStrategiesByStyle } from "@/lib/strategies";
import {
  THRESHOLD_PRESETS,
  TRADING_STYLES,
  type RiskTolerance,
  type StrategySignal,
  type TradingStyle,
} from "@/lib/strategies/types";
import type { Recommendation, RecommendationFeed } from "./types";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * The recommendation engine.
 *
 * Runs every strategy for a trading style across the whole NSE/BSE universe and
 * turns the resulting signals into cards. Only *bullish* signals become
 * recommendations — this app suggests what to look at buying, and presenting a
 * short setup as a "buy range" would be actively misleading. Bearish signals
 * are still computed and surfaced on the stock detail screen as caution flags,
 * which is genuinely useful information when deciding whether to buy.
 */

const MAX_PER_STRATEGY = 6;
const MAX_FEED_SIZE = 40;

/**
 * Pseudo-count for the win-rate prior.
 *
 * A strategy's measured win rate is used to nudge its confidence up or down, but
 * an unshrunk rate off two resolved trades is noise, not evidence: one winner
 * would read as 100% and multiply confidence by the full amount. Blending the
 * observed rate toward a 0.5 prior with a weight of `PRIOR_TRADES` means a
 * strategy needs roughly this many resolved trades before its record moves the
 * score even half as far as the raw rate would suggest.
 */
const PRIOR_TRADES = 20;

/** Bound on how far a strategy's track record may move its confidence. */
const WIN_RATE_TILT = 0.3;

interface StrategyRecord {
  winRate: number;
  totalTrades: number;
}

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

/**
 * Tilt a confidence score by the strategy's realised win rate.
 *
 * The shrunk rate sits in [0, 1] and is centred on 0.5, so the multiplier spans
 * [1 - WIN_RATE_TILT, 1 + WIN_RATE_TILT] and lands on exactly 1 for a strategy
 * with no record at all. The score stays inside the 0–98 band the strategies
 * themselves use — nothing in markets deserves a 100.
 */
function applyWinRate(confidence: number, record: StrategyRecord | undefined): number {
  if (!record || record.totalTrades <= 0) return confidence;

  const shrunk =
    (record.winRate * record.totalTrades + 0.5 * PRIOR_TRADES) /
    (record.totalTrades + PRIOR_TRADES);

  const multiplier = 1 + (shrunk - 0.5) * 2 * WIN_RATE_TILT;
  return Math.max(0, Math.min(98, Math.round(confidence * multiplier)));
}

function toRecommendation(
  signal: StrategySignal,
  bundle: StockDataBundle,
  generatedAt: string,
): Recommendation {
  const strategy = ALL_STRATEGIES.find((s) => s.id === signal.strategyId)!;
  const { instrument, quote } = bundle;

  return {
    id: `${instrument.ticker}:${signal.strategyId}`,
    ticker: instrument.ticker,
    name: instrument.name,
    exchange: instrument.exchange,
    sector: instrument.sector,
    industry: instrument.industry,
    marketCapCr: instrument.marketCapCr,

    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,

    strategyId: signal.strategyId,
    strategyName: strategy.name,
    tradingStyle: signal.style,
    direction: signal.direction,

    reason: signal.reason,

    buyRange: signal.entry,
    sellRange: signal.target,
    stopLoss: signal.stopLoss,

    estimatedHoldDays: signal.holdDays,
    holdPeriodLabel: strategy.holdPeriodLabel,

    riskLevel: signal.risk,
    confidenceScore: signal.confidence,

    conditions: signal.conditions,
    metrics: signal.metrics,

    generatedAt,
  };
}

/**
 * Evaluate every strategy for one stock, across all styles.
 * Failures in a single strategy must not take down the whole screen, so each
 * evaluation is isolated.
 */
export function evaluateAllStrategies(
  bundle: StockDataBundle,
  tolerance: RiskTolerance,
): StrategySignal[] {
  const thresholds = THRESHOLD_PRESETS[tolerance];
  const signals: StrategySignal[] = [];

  for (const strategy of ALL_STRATEGIES) {
    try {
      const signal = strategy.evaluate({ bundle, thresholds });
      if (signal) signals.push(signal);
    } catch (error) {
      console.error(
        `[engine] ${strategy.id} threw while evaluating ${bundle.instrument.ticker}:`,
        error,
      );
    }
  }

  return signals;
}

/** Build the recommendation feed for one trading style. */
export async function generateFeed(
  style: TradingStyle,
  tolerance: RiskTolerance = "moderate",
): Promise<RecommendationFeed> {
  const provider = getMarketDataProvider();
  const thresholds = THRESHOLD_PRESETS[tolerance];
  const bundles = await getUniverseBundles();
  const strategies = getStrategiesByStyle(style);
  const generatedAt = new Date().toISOString();

  const performanceMap = await fetchStrategyRecords();

  const byStrategy = new Map<string, Recommendation[]>();

  for (const bundle of bundles) {
    for (const strategy of strategies) {
      let signal: StrategySignal | null = null;
      try {
        signal = strategy.evaluate({ bundle, thresholds });
      } catch (error) {
        console.error(
          `[engine] ${strategy.id} threw while evaluating ${bundle.instrument.ticker}:`,
          error,
        );
        continue;
      }

      // Only long setups become recommendation cards.
      if (!signal || signal.direction !== "bullish") continue;

      const rec = toRecommendation(signal, bundle, generatedAt);
      rec.confidenceScore = applyWinRate(rec.confidenceScore, performanceMap.get(strategy.id));

      const list = byStrategy.get(strategy.id) ?? [];
      list.push(rec);
      byStrategy.set(strategy.id, list);
    }
  }

  // Cap per strategy so one prolific screen can't crowd out the other four,
  // then interleave by rank so the feed opens with the best of each.
  const ranked: Recommendation[][] = [];
  for (const strategy of strategies) {
    const list = (byStrategy.get(strategy.id) ?? [])
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, MAX_PER_STRATEGY);
    ranked.push(list);
  }

  const interleaved: Recommendation[] = [];
  const seenTickers = new Set<string>();
  const deepest = Math.max(0, ...ranked.map((l) => l.length));
  
  for (let round = 0; round < deepest; round++) {
    const slice = ranked
      .map((list) => list[round])
      .filter((r): r is Recommendation => Boolean(r))
      .sort((a, b) => b.confidenceScore - a.confidenceScore);
      
    for (const r of slice) {
      if (!seenTickers.has(r.ticker)) {
        seenTickers.add(r.ticker);
        interleaved.push(r);
      }
    }
  }

  return {
    style,
    recommendations: interleaved.slice(0, MAX_FEED_SIZE),
    generatedAt,
    dataSource: provider.name,
    isLiveData: provider.isLive,
    universeSize: bundles.length,
  };
}

export interface StockAnalysis {
  bundle: StockDataBundle;
  /** Bullish setups currently firing, best first. */
  bullishSignals: StrategySignal[];
  /** Bearish setups — shown as caution flags, never as buy recommendations. */
  bearishSignals: StrategySignal[];
  recommendations: Recommendation[];
  generatedAt: string;
  dataSource: string;
  isLiveData: boolean;
}

/** Everything the stock detail screen needs. */
export async function analyseStock(
  ticker: string,
  tolerance: RiskTolerance = "moderate",
): Promise<StockAnalysis | null> {
  const bundle = await getStockBundle(ticker);
  if (!bundle) return null;

  const provider = getMarketDataProvider();
  const generatedAt = new Date().toISOString();
  const signals = evaluateAllStrategies(bundle, tolerance);
  const performanceMap = await fetchStrategyRecords();

  // Tilt by track record before sorting, so the ordering here matches the feed's.
  for (const signal of signals) {
    signal.confidence = applyWinRate(signal.confidence, performanceMap.get(signal.strategyId));
  }

  const bullishSignals = signals
    .filter((s) => s.direction === "bullish")
    .sort((a, b) => b.confidence - a.confidence);
  const bearishSignals = signals
    .filter((s) => s.direction === "bearish")
    .sort((a, b) => b.confidence - a.confidence);

  return {
    bundle,
    bullishSignals,
    bearishSignals,
    recommendations: bullishSignals.map((s) => toRecommendation(s, bundle, generatedAt)),
    generatedAt,
    dataSource: provider.name,
    isLiveData: provider.isLive,
  };
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
