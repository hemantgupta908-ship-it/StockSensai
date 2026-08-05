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

      const list = byStrategy.get(strategy.id) ?? [];
      list.push(toRecommendation(signal, bundle, generatedAt));
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
