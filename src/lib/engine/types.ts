import type { Exchange } from "@/lib/market-data/types";
import type {
  PriceRange,
  RiskLevel,
  SignalDirection,
  StrategyCondition,
  StrategyId,
  TradingStyle,
} from "@/lib/strategies/types";

/**
 * A recommendation is a strategy signal joined with everything the UI needs to
 * render a card without another round trip.
 *
 * Buy and sell figures are always ranges. A single price implies a precision
 * that no screening model has, and encourages people to place limit orders at
 * a number an algorithm produced.
 */
export interface Recommendation {
  /** Stable composite id: `TICKER:strategy-id`. */
  id: string;

  ticker: string;
  name: string;
  exchange: Exchange;
  sector: string;
  industry: string;
  marketCapCr: number;

  price: number;
  change: number;
  changePercent: number;

  strategyId: StrategyId;
  strategyName: string;
  tradingStyle: TradingStyle;
  direction: SignalDirection;

  /** Plain-language explanation of why this stock surfaced. */
  reason: string;

  buyRange: PriceRange;
  sellRange: PriceRange;
  stopLoss: number;

  estimatedHoldDays: { min: number; max: number };
  holdPeriodLabel: string;

  riskLevel: RiskLevel;
  confidenceScore: number;

  conditions: StrategyCondition[];
  metrics: { label: string; value: string }[];

  /** ISO timestamp of when this was computed. */
  generatedAt: string;
}

export interface RecommendationFeed {
  style: TradingStyle;
  recommendations: Recommendation[];
  generatedAt: string;
  /** Name of the provider that supplied the underlying data. */
  dataSource: string;
  /** False when the data is simulated, so the UI can badge it honestly. */
  isLiveData: boolean;
  /** How many instruments were screened to produce this feed. */
  universeSize: number;
}
