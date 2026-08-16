import { StockDataBundle } from "@/lib/market-data/types";
import { atr, averageVolume, closes, ema, last, rsi, percentChange } from "@/lib/indicators";

export interface MLFeatures {
  rsiDivergence: number; // (RSI - 50) / 50
  volumeSurge: number; // (Current Vol - 20d Avg Vol) / 20d Avg Vol
  priceVs20Ema: number; // (Price - 20EMA) / 20EMA
  priceVs50Ema: number; // (Price - 50EMA) / 50EMA
  relativeStrength: number; // 20d Stock Return - 20d Benchmark Return
  volatility: number; // 14d ATR / Price
}

/**
 * Ceiling on the volume-surge feature.
 *
 * The surge is the only unbounded input in the vector — every other feature is
 * a bounded ratio — so without a cap it dominates the logit outright and the
 * model degenerates into a volume-spike detector. Three times average volume is
 * already an emphatic confirmation; ten times is usually a block deal or an
 * index rebalance, which says nothing about the setup.
 */
const MAX_VOLUME_SURGE = 3;

/** Minimum daily history before the vector means anything. */
export const MIN_FEATURE_BARS = 50;

/**
 * Extracts a normalized feature vector for the ML Predictor.
 *
 * Returns `null` when the stock has too little history to compute the vector.
 * Deliberately not a zero vector: all-zeros is a perfectly ordinary reading that
 * the model scores off its bias alone, so a newly listed stock would come back
 * with a mid-band probability that looks like a considered verdict rather than
 * an absence of data. Callers must decide what to do without the model.
 */
export function extractFeatures(bundle: StockDataBundle): number[] | null {
  const { daily, benchmarkDaily, quote } = bundle;
  const currentPrice = quote.price;

  if (daily.length < MIN_FEATURE_BARS) {
    return null;
  }

  const closeSeries = closes(daily);

  // 1. RSI Divergence (-1 to +1 typical)
  const rsiSeries = rsi(closeSeries, 14);
  const currentRsi = last(rsiSeries) || 50;
  const rsiDivergence = (currentRsi - 50) / 50;

  // 2. Volume Surge (0 to MAX_VOLUME_SURGE)
  //
  // The baseline excludes the current bar. Including it folds the spike into
  // its own average, which understates every surge — a true 3x day computes as
  // 1.7x over a 20-bar window — and is inconsistent with every other volume
  // comparison in the codebase.
  const avgVol20 = averageVolume(daily, 20, true) || 1;
  const currentVol = daily[daily.length - 1].volume || 1;
  const volumeSurge = Math.min(
    MAX_VOLUME_SURGE,
    Math.max(0, (currentVol - avgVol20) / avgVol20),
  );

  // 3. Price Extension (20EMA)
  const ema20 = last(ema(closeSeries, 20)) || currentPrice;
  const priceVs20Ema = (currentPrice - ema20) / ema20;

  // 4. Trend Baseline (50EMA)
  const ema50 = last(ema(closeSeries, 50)) || currentPrice;
  const priceVs50Ema = (currentPrice - ema50) / ema50;

  // 5. Relative Strength (vs Nifty 50)
  const stockRet = percentChange(closeSeries, 20) || 0;
  const benchCloseSeries = closes(benchmarkDaily);
  const benchRet = percentChange(benchCloseSeries, 20) || 0;
  const relativeStrength = stockRet - benchRet;

  // 6. Volatility (ATR %)
  const atr14 = last(atr(daily, 14)) || 0;
  const volatility = currentPrice > 0 ? atr14 / currentPrice : 0;

  return [
    rsiDivergence,
    volumeSurge,
    priceVs20Ema,
    priceVs50Ema,
    relativeStrength / 100, // normalize to fraction
    volatility
  ];
}
