import type { StockDataBundle } from "@/lib/market-data/types";

export type TradingStyle = "swing" | "short-term" | "long-term";

export const TRADING_STYLES: readonly TradingStyle[] = ["swing", "short-term", "long-term"];

export const TRADING_STYLE_LABELS: Record<TradingStyle, string> = {
  swing: "Swing",
  "short-term": "Short-Term",
  "long-term": "Long-Term",
};

export const TRADING_STYLE_DESCRIPTIONS: Record<TradingStyle, string> = {
  swing: "Hold a few days to a few weeks, riding one leg of a trend.",
  "short-term": "Intraday to a couple of sessions, driven by momentum and volume.",
  "long-term": "One to five years, driven by business quality and valuation.",
};

export type RiskLevel = "Low" | "Medium" | "High";

export type SignalDirection = "bullish" | "bearish";

export type RiskTolerance = "conservative" | "moderate" | "aggressive";

/** One testable clause of a strategy. Confidence is built from these. */
export interface StrategyCondition {
  /** Short label, e.g. "20 EMA above 50 EMA". */
  label: string;
  met: boolean;
  /** The actual numbers behind the verdict, shown on the detail screen. */
  detail: string;
  /** Relative contribution to the confidence score. */
  weight: number;
  /** When a required condition fails, the strategy produces no signal at all. */
  required?: boolean;
}

export interface PriceRange {
  low: number;
  high: number;
}

export interface StrategySignal {
  strategyId: StrategyId;
  ticker: string;
  style: TradingStyle;
  direction: SignalDirection;
  /** 0–100, derived from the proportion of weighted conditions met. */
  confidence: number;
  conditions: StrategyCondition[];
  /** Plain-language "why this stock", written for a non-technical reader. */
  reason: string;
  entry: PriceRange;
  target: PriceRange;
  stopLoss: number;
  holdDays: { min: number; max: number };
  risk: RiskLevel;
  /** Strategy-specific readings surfaced in the UI. */
  metrics: { label: string; value: string }[];
}

/**
 * Threshold set tuned by the user's risk tolerance.
 *
 * Conservative demands more confirmation and accepts fewer, higher-quality
 * signals; aggressive loosens the gates and accepts more marginal setups.
 */
export interface Thresholds {
  tolerance: RiskTolerance;
  /** Signals below this confidence are discarded entirely. */
  minConfidence: number;
  /** Multiplier on required volume confirmation (1.5x average is the base). */
  volumeSurgeMultiple: number;
  /** RSI oversold / overbought boundaries. */
  rsiOversold: number;
  rsiOverbought: number;
  /** ATR multiple used to place stops. */
  stopAtrMultiple: number;
  /** Minimum reward-to-risk the setup must offer to be shown. */
  minRewardRisk: number;
  /** Relative-strength margin vs NIFTY over 5 sessions, in percentage points. */
  relativeStrengthMargin: number;
  /** Long-term quality gates. */
  minRoe: number;
  maxDebtToEquity: number;
  minRevenueCagr: number;
}

export const THRESHOLD_PRESETS: Record<RiskTolerance, Thresholds> = {
  conservative: {
    tolerance: "conservative",
    minConfidence: 62,
    volumeSurgeMultiple: 1.8,
    rsiOversold: 28,
    rsiOverbought: 72,
    stopAtrMultiple: 1.6,
    minRewardRisk: 2.0,
    relativeStrengthMargin: 4,
    minRoe: 18,
    maxDebtToEquity: 0.4,
    minRevenueCagr: 15,
  },
  moderate: {
    tolerance: "moderate",
    minConfidence: 50,
    volumeSurgeMultiple: 1.5,
    rsiOversold: 30,
    rsiOverbought: 70,
    stopAtrMultiple: 2.0,
    minRewardRisk: 1.6,
    relativeStrengthMargin: 3,
    minRoe: 15,
    maxDebtToEquity: 0.5,
    minRevenueCagr: 12,
  },
  aggressive: {
    tolerance: "aggressive",
    minConfidence: 40,
    volumeSurgeMultiple: 1.25,
    rsiOversold: 35,
    rsiOverbought: 65,
    stopAtrMultiple: 2.6,
    minRewardRisk: 1.3,
    relativeStrengthMargin: 2,
    minRoe: 12,
    maxDebtToEquity: 0.8,
    minRevenueCagr: 10,
  },
};

export interface StrategyContext {
  bundle: StockDataBundle;
  thresholds: Thresholds;
}

/** Long-form content for the strategy explainer screens. */
export interface StrategyExplainer {
  summary: string;
  /** Where the technique comes from and why practitioners use it. */
  origin: string;
  howItWorks: string[];
  signalConditions: string[];
  entryLogic: string;
  exitLogic: string;
  worksBestWhen: string[];
  failsWhen: string[];
  indicators: string[];
}

export interface Strategy {
  id: StrategyId;
  name: string;
  style: TradingStyle;
  /** One-liner shown on cards. */
  tagline: string;
  holdPeriodLabel: string;
  baseRisk: RiskLevel;
  explainer: StrategyExplainer;
  /** Returns null when the setup is not present. */
  evaluate(context: StrategyContext): StrategySignal | null;
}

export type StrategyId =
  // Swing
  | "swing-ma-crossover"
  | "swing-rsi-reversal"
  | "swing-consolidation-breakout"
  | "swing-support-resistance-bounce"
  | "swing-macd-crossover"
  // Short-term
  | "st-gap-continuation"
  | "st-vwap-momentum"
  | "st-bollinger-squeeze"
  | "st-relative-strength"
  | "st-opening-range-breakout"
  // Long-term
  | "lt-value"
  | "lt-growth"
  | "lt-dividend-growth"
  | "lt-thematic"
  | "lt-quality-momentum";

// ---------------------------------------------------------------- helpers

/**
 * Confidence from weighted conditions.
 *
 * Scaled into a 35–98 band rather than 0–100: a signal that fires at all has
 * already cleared its required conditions, so a raw score of 20% would be
 * misleadingly bleak, and nothing in markets deserves a 100.
 */
export function scoreConditions(conditions: StrategyCondition[]): number {
  const total = conditions.reduce((sum, c) => sum + c.weight, 0);
  if (total === 0) return 0;
  const met = conditions.reduce((sum, c) => sum + (c.met ? c.weight : 0), 0);
  const ratio = met / total;
  return Math.round(35 + ratio * 63);
}

/** A strategy is void if any condition marked `required` is unmet. */
export function requiredConditionsMet(conditions: StrategyCondition[]): boolean {
  return conditions.every((c) => !c.required || c.met);
}

/**
 * Reward-to-risk floor, adjusted for holding period.
 *
 * Intraday setups carry structurally lower reward-to-risk than positional ones
 * — an opening-range breakout risks the entire opening range by construction —
 * and compensate with frequency and a higher hit rate. Holding all three styles
 * to the same ratio doesn't make the short-term screens safer, it just makes
 * them silent. Long-term theses, conversely, should clear a wider bar because
 * the capital is committed for years.
 */
export function minRewardRiskFor(thresholds: Thresholds, style: TradingStyle): number {
  const factor = style === "short-term" ? 0.8 : style === "long-term" ? 1.15 : 1;
  return thresholds.minRewardRisk * factor;
}

/** Reward-to-risk from the midpoints of the entry and target bands. */
export function rewardToRisk(
  entry: PriceRange,
  target: PriceRange,
  stopLoss: number,
  direction: SignalDirection,
): number {
  const entryMid = (entry.low + entry.high) / 2;
  const targetMid = (target.low + target.high) / 2;
  const reward = direction === "bullish" ? targetMid - entryMid : entryMid - targetMid;
  const risk = direction === "bullish" ? entryMid - stopLoss : stopLoss - entryMid;
  if (risk <= 0) return 0;
  return reward / risk;
}

/**
 * Risk grading from stop distance — how much of the position is exposed if the
 * setup fails. Wider stops mean more capital at risk per unit of conviction.
 */
export function riskFromStopDistance(entryMid: number, stopLoss: number): RiskLevel {
  const distancePct = (Math.abs(entryMid - stopLoss) / entryMid) * 100;
  if (distancePct <= 3.5) return "Low";
  if (distancePct <= 7) return "Medium";
  return "High";
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Build a low–high band around an anchor price. Never a single figure. */
export function bandAround(anchor: number, widthPct: number): PriceRange {
  const half = (anchor * widthPct) / 100 / 2;
  return { low: round2(anchor - half), high: round2(anchor + half) };
}
