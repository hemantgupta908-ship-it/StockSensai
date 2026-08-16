import type { Instrument } from "../types";
import { NIFTY200_UNIVERSE } from "./instruments.generated";

/**
 * Seeded universe of large/mid-cap NSE names.
 *
 * IMPORTANT: every number below is *simulation input*, not real market data.
 * Prices, ratios and volumes are plausible ranges for each business so the
 * demo looks and behaves like the real thing, but they are not quotes and must
 * never be presented as such. Swap in a live provider for real values.
 */

/**
 * Shape of the last ~60 sessions of generated price action.
 *
 * The generator biases the random walk toward these regimes so that the
 * strategy engine — which runs genuine indicator maths on the output — has
 * real conditions to detect. Roughly a fifth of the universe is deliberately
 * `choppy` so that not every stock produces a signal.
 */
export type TechnicalScenario =
  | "ema-golden-cross"
  | "oversold-bounce"
  | "overbought-fade"
  | "range-breakout"
  | "support-bounce"
  | "macd-bull-cross"
  | "gap-up-continuation"
  | "gap-down-continuation"
  | "bb-squeeze-breakout"
  | "strong-uptrend"
  /** Wide-range session that opens near its low and closes near its high. */
  | "intraday-trend-day"
  | "downtrend"
  | "choppy";

/** Drives the fundamental figures used by the long-term strategies. */
export type FundamentalArchetype =
  | "deep-value"
  | "quality-growth"
  | "dividend-payer"
  | "high-growth"
  | "thematic-growth"
  | "cyclical"
  | "expensive-quality"
  | "leveraged";

export interface SeedInstrument extends Instrument {
  sim: {
    /** Approximate close ~14 months ago; the walk starts here. */
    basePrice: number;
    /** Annualised volatility, e.g. 0.28 = 28%. */
    annualVol: number;
    /** Annualised drift over the simulated window. */
    annualDrift: number;
    /** Typical daily traded quantity in shares. */
    avgVolume: number;
    scenario: TechnicalScenario;
    archetype: FundamentalArchetype;
    /** Explicit fundamental anchors; the rest is derived from the archetype. */
    pe: number;
    pb: number;
    roe: number;
    debtToEquity: number;
    dividendYield: number;
    themes: string[];
    /**
     * Simulation-only market cap, for generated entries whose real one is not
     * known (`marketCapCr: 0`). The demo's fundamentals generator needs *some*
     * capitalisation to derive believable profit figures from; this keeps that
     * number inside the simulation rather than surfacing it in the UI as if it
     * were researched. Curated entries leave it unset and use `marketCapCr`.
     */
    marketCapCr?: number;
  };
}

/**
 * Whether a real, researched market capitalisation is known for an instrument.
 *
 * Generated entries carry `0`, meaning "not known". The figure is shown to the
 * user as a plain fact on the stock screen, so an invented one would be
 * believed — callers must check before rendering it.
 */
export function hasKnownMarketCap(marketCapCr: number): boolean {
  return Number.isFinite(marketCapCr) && marketCapCr > 0;
}

/** Median P/E and P/B per sector, used for relative-value screening. */
export const SECTOR_STATS: Record<string, { pe: number; pb: number }> = {
  "Information Technology": { pe: 27.5, pb: 8.2 },
  "Financial Services": { pe: 17.8, pb: 2.6 },
  "Oil, Gas & Consumable Fuels": { pe: 14.2, pb: 1.9 },
  "Fast Moving Consumer Goods": { pe: 45.0, pb: 10.5 },
  Automobile: { pe: 24.0, pb: 4.1 },
  Healthcare: { pe: 31.0, pb: 4.6 },
  "Metals & Mining": { pe: 12.5, pb: 1.7 },
  Power: { pe: 16.0, pb: 2.2 },
  "Capital Goods": { pe: 38.0, pb: 6.4 },
  "Construction Materials": { pe: 35.0, pb: 4.2 },
  Telecommunication: { pe: 42.0, pb: 7.8 },
  "Consumer Durables": { pe: 52.0, pb: 12.0 },
  Services: { pe: 26.0, pb: 3.8 },
  "Capital Goods - Defence": { pe: 40.0, pb: 9.0 },
  // Sectors introduced by the Nifty 200 expansion. Approximations, like the
  // rows above — the live provider computes real medians per sector from the
  // universe and overrides these wherever it has three or more peers.
  "Consumer Services": { pe: 48.0, pb: 9.0 },
  Realty: { pe: 34.0, pb: 3.6 },
  Chemicals: { pe: 29.0, pb: 4.0 },
  Construction: { pe: 27.0, pb: 3.4 },
  Textiles: { pe: 22.0, pb: 2.6 },
};


/**
 * The screening universe: NSE's Nifty 200, plus any previously curated name
 * that has since left the index.
 *
 * Generated from `data/ind_nifty200list.csv` — see `scripts/build-universe.ts`.
 * Kept in a separate file because it is machine-written and 200-odd entries
 * long; this module stays hand-editable for the types and sector tables above.
 */
export const SEED_INSTRUMENTS: SeedInstrument[] = NIFTY200_UNIVERSE;

export const BENCHMARK = {
  symbol: "NIFTY 50",
  ticker: "NIFTY50",
  basePrice: 22_400,
  annualVol: 0.13,
  annualDrift: 0.12,
} as const;

export const SEED_BY_TICKER = new Map(SEED_INSTRUMENTS.map((i) => [i.ticker, i]));

/** Distinct structural themes across the universe, for the thematic strategy. */
export const ALL_THEMES = Array.from(
  new Set(SEED_INSTRUMENTS.flatMap((i) => i.sim.themes)),
).sort();
