import type { Candle } from "@/lib/market-data/types";
import { swingHighs, swingLows } from "@/lib/indicators";
import { round2, type PriceRange, type StrategyCondition } from "./types";

/**
 * Shared plumbing for strategy implementations. Kept separate so each strategy
 * file reads as its trading logic and nothing else.
 */

export function condition(
  label: string,
  met: boolean,
  detail: string,
  weight = 1,
  required = false,
): StrategyCondition {
  return { label, met, detail, weight, required };
}

/** The closest swing-high pivot above `price`, i.e. the next overhead supply. */
export function nearestSwingHighAbove(
  candles: Candle[],
  price: number,
  lookbackBars = 90,
): number | null {
  const window = candles.slice(-lookbackBars);
  const pivots = swingHighs(window, 3)
    .map((i) => window[i].high)
    .filter((h) => h > price * 1.005)
    .sort((a, b) => a - b);
  return pivots[0] ?? null;
}

/** The closest swing-low pivot below `price`, i.e. the nearest demand shelf. */
export function nearestSwingLowBelow(
  candles: Candle[],
  price: number,
  lookbackBars = 90,
): number | null {
  const window = candles.slice(-lookbackBars);
  const pivots = swingLows(window, 3)
    .map((i) => window[i].low)
    .filter((l) => l < price * 0.995)
    .sort((a, b) => b - a);
  return pivots[0] ?? null;
}

/**
 * Entry band.
 *
 * Anchored slightly *below* the current price for long setups: chasing a
 * breakout at the highs is how retail traders get filled at the worst price of
 * the move. The band spans a realistic pullback zone rather than a single tick.
 */
export function longEntryBand(currentPrice: number, widthPct: number, skewPct = 0.4): PriceRange {
  const centre = currentPrice * (1 - skewPct / 100);
  const half = (centre * widthPct) / 100 / 2;
  return { low: round2(centre - half), high: round2(centre + half) };
}

export function shortEntryBand(currentPrice: number, widthPct: number, skewPct = 0.4): PriceRange {
  const centre = currentPrice * (1 + skewPct / 100);
  const half = (centre * widthPct) / 100 / 2;
  return { low: round2(centre - half), high: round2(centre + half) };
}

/** Target band around an objective level. */
export function targetBand(level: number, widthPct: number): PriceRange {
  const half = (level * widthPct) / 100 / 2;
  return { low: round2(level - half), high: round2(level + half) };
}

/** Guard against inverted or degenerate bands leaking into the UI. */
export function sanitiseBand(band: PriceRange): PriceRange {
  const low = Math.min(band.low, band.high);
  const high = Math.max(band.low, band.high);
  return { low: round2(low), high: round2(high === low ? low * 1.002 : high) };
}

export function pct(value: number, decimals = 1): string {
  return `${value >= 0 ? "" : ""}${value.toFixed(decimals)}%`;
}

export function money(value: number): string {
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function ratio(value: number, decimals = 2): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : "—";
}

/** Compact "x times average" phrasing used across volume conditions. */
export function timesAverage(value: number, average: number): string {
  if (!Number.isFinite(average) || average === 0) return "—";
  return `${(value / average).toFixed(2)}x average`;
}
