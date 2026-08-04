import type { Candle } from "@/lib/market-data/types";

/**
 * Technical indicator library.
 *
 * Conventions used throughout:
 *  - Input series are ordered oldest -> newest.
 *  - Output arrays are the same length as the input; values that cannot be
 *    computed yet (inside the warm-up window) are `NaN`, never 0. Callers must
 *    check with `Number.isFinite` — treating a warm-up 0 as a real reading is
 *    the classic way to manufacture false crossover signals.
 */

export const closes = (candles: Candle[]) => candles.map((c) => c.close);
export const highs = (candles: Candle[]) => candles.map((c) => c.high);
export const lows = (candles: Candle[]) => candles.map((c) => c.low);
export const volumes = (candles: Candle[]) => candles.map((c) => c.volume);

/** Simple moving average. */
export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;

  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average.
 * Seeded with the SMA of the first `period` values, which is the standard
 * convention (and what charting platforms display).
 */
export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;

  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  out[period - 1] = seed / period;

  for (let i = period; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

/**
 * Wilder's RSI — the original smoothing (alpha = 1/period), not a plain EMA.
 * Using an EMA here shifts the 30/70 crossings by a bar or two, which matters
 * when the whole signal is "did it just cross 30".
 */
export function rsi(values: number[], period = 14): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gainSum += delta;
    else lossSum -= delta;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface MacdResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

/** MACD(12, 26, 9) by default. */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine = values.map((_, i) =>
    Number.isFinite(fastEma[i]) && Number.isFinite(slowEma[i]) ? fastEma[i] - slowEma[i] : NaN,
  );

  // The signal line is an EMA of the MACD line, which only exists after the
  // slow EMA warms up — so run it over the defined slice and re-align.
  const firstValid = macdLine.findIndex(Number.isFinite);
  const signal = new Array<number>(values.length).fill(NaN);
  if (firstValid >= 0) {
    const signalSlice = ema(macdLine.slice(firstValid), signalPeriod);
    signalSlice.forEach((v, i) => {
      signal[firstValid + i] = v;
    });
  }

  const histogram = macdLine.map((v, i) =>
    Number.isFinite(v) && Number.isFinite(signal[i]) ? v - signal[i] : NaN,
  );

  return { macd: macdLine, signal, histogram };
}

export interface BollingerResult {
  upper: number[];
  middle: number[];
  lower: number[];
  /** (upper - lower) / middle, expressed as a fraction. */
  bandwidth: number[];
}

export function bollinger(values: number[], period = 20, stdDevs = 2): BollingerResult {
  const middle = sma(values, period);
  const upper = new Array<number>(values.length).fill(NaN);
  const lower = new Array<number>(values.length).fill(NaN);
  const bandwidth = new Array<number>(values.length).fill(NaN);

  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1);
    const mean = middle[i];
    const variance = window.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper[i] = mean + stdDevs * sd;
    lower[i] = mean - stdDevs * sd;
    bandwidth[i] = mean !== 0 ? (upper[i] - lower[i]) / mean : NaN;
  }

  return { upper, middle, lower, bandwidth };
}

/** Average True Range (Wilder smoothing). Used for volatility-scaled stops. */
export function atr(candles: Candle[], period = 14): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length <= period) return out;

  const trueRanges: number[] = [NaN];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trueRanges[i];
  out[period] = sum / period;

  for (let i = period + 1; i < candles.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + trueRanges[i]) / period;
  }
  return out;
}

/**
 * Session-anchored VWAP over intraday bars.
 *
 * Resets at each session boundary — a VWAP that carries across days is
 * meaningless for the intraday strategies that reference it.
 */
export function sessionVwap(candles: Candle[]): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  let cumulativePv = 0;
  let cumulativeVolume = 0;
  let currentSession = -1;

  for (let i = 0; i < candles.length; i++) {
    const session = sessionKey(candles[i].time);
    if (session !== currentSession) {
      currentSession = session;
      cumulativePv = 0;
      cumulativeVolume = 0;
    }
    const typical = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumulativePv += typical * candles[i].volume;
    cumulativeVolume += candles[i].volume;
    out[i] = cumulativeVolume > 0 ? cumulativePv / cumulativeVolume : NaN;
  }
  return out;
}

/** IST calendar day for an epoch-second timestamp, as a day number. */
export function sessionKey(epochSeconds: number): number {
  return Math.floor((epochSeconds + 5.5 * 3600) / 86400);
}

/** Split intraday bars into per-session groups, oldest session first. */
export function groupBySession(candles: Candle[]): Candle[][] {
  const groups = new Map<number, Candle[]>();
  for (const candle of candles) {
    const key = sessionKey(candle.time);
    const group = groups.get(key);
    if (group) group.push(candle);
    else groups.set(key, [candle]);
  }
  return Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, group]) => group);
}

/**
 * Swing pivots: a bar whose high exceeds the `lookback` bars on both sides.
 * Returns indices into the input array.
 */
export function swingHighs(candles: Candle[], lookback = 3): number[] {
  const out: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const pivot = candles[i].high;
    let isPivot = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].high >= pivot) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) out.push(i);
  }
  return out;
}

export function swingLows(candles: Candle[], lookback = 3): number[] {
  const out: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const pivot = candles[i].low;
    let isPivot = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].low <= pivot) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) out.push(i);
  }
  return out;
}

/**
 * Cluster nearby swing points into horizontal support/resistance zones.
 * A level tested more often is a stronger level, which is what the
 * support/resistance strategy scores on.
 */
export interface PriceZone {
  level: number;
  touches: number;
  /** Index of the most recent touch. */
  lastTouchIndex: number;
}

export function findPriceZones(
  candles: Candle[],
  pivotIndices: number[],
  priceOf: (c: Candle) => number,
  tolerancePct = 0.02,
): PriceZone[] {
  const zones: PriceZone[] = [];

  for (const index of pivotIndices) {
    const price = priceOf(candles[index]);
    const existing = zones.find((z) => Math.abs(z.level - price) / z.level <= tolerancePct);
    if (existing) {
      // Running average keeps the zone centred on all its touches.
      existing.level = (existing.level * existing.touches + price) / (existing.touches + 1);
      existing.touches += 1;
      existing.lastTouchIndex = Math.max(existing.lastTouchIndex, index);
    } else {
      zones.push({ level: price, touches: 1, lastTouchIndex: index });
    }
  }

  return zones.sort((a, b) => b.touches - a.touches);
}

/** Highest high / lowest low over the trailing `period` bars. */
export function highestHigh(candles: Candle[], period: number, endIndex?: number): number {
  const end = endIndex ?? candles.length - 1;
  const start = Math.max(0, end - period + 1);
  let max = -Infinity;
  for (let i = start; i <= end; i++) max = Math.max(max, candles[i].high);
  return max;
}

export function lowestLow(candles: Candle[], period: number, endIndex?: number): number {
  const end = endIndex ?? candles.length - 1;
  const start = Math.max(0, end - period + 1);
  let min = Infinity;
  for (let i = start; i <= end; i++) min = Math.min(min, candles[i].low);
  return min;
}

/** Percentage change between two closes, `bars` apart, ending at the last bar. */
export function percentChange(values: number[], bars: number): number {
  if (values.length <= bars) return NaN;
  const now = values[values.length - 1];
  const then = values[values.length - 1 - bars];
  if (!Number.isFinite(now) || !Number.isFinite(then) || then === 0) return NaN;
  return ((now - then) / then) * 100;
}

/** Average volume over the trailing `period` bars, excluding the current one. */
export function averageVolume(candles: Candle[], period = 20, excludeLast = true): number {
  const end = candles.length - (excludeLast ? 1 : 0);
  const start = Math.max(0, end - period);
  if (end <= start) return NaN;
  let sum = 0;
  for (let i = start; i < end; i++) sum += candles[i].volume;
  return sum / (end - start);
}

// --------------------------------------------------------------- crossovers

/**
 * Detects a crossover of `a` above `b` within the last `withinBars` bars.
 * Returns the number of bars ago it happened, or -1 if it didn't.
 * Requires both series to be finite at the crossing — see the NaN note above.
 */
export function crossedAbove(a: number[], b: number[], withinBars = 3): number {
  const n = Math.min(a.length, b.length);
  for (let back = 0; back < withinBars; back++) {
    const i = n - 1 - back;
    if (i < 1) break;
    if (
      Number.isFinite(a[i]) &&
      Number.isFinite(b[i]) &&
      Number.isFinite(a[i - 1]) &&
      Number.isFinite(b[i - 1]) &&
      a[i - 1] <= b[i - 1] &&
      a[i] > b[i]
    ) {
      return back;
    }
  }
  return -1;
}

export function crossedBelow(a: number[], b: number[], withinBars = 3): number {
  const n = Math.min(a.length, b.length);
  for (let back = 0; back < withinBars; back++) {
    const i = n - 1 - back;
    if (i < 1) break;
    if (
      Number.isFinite(a[i]) &&
      Number.isFinite(b[i]) &&
      Number.isFinite(a[i - 1]) &&
      Number.isFinite(b[i - 1]) &&
      a[i - 1] >= b[i - 1] &&
      a[i] < b[i]
    ) {
      return back;
    }
  }
  return -1;
}

/** Crossover of a series above a constant threshold (e.g. RSI up through 30). */
export function crossedAboveLevel(series: number[], level: number, withinBars = 3): number {
  return crossedAbove(
    series,
    new Array(series.length).fill(level),
    withinBars,
  );
}

export function crossedBelowLevel(series: number[], level: number, withinBars = 3): number {
  return crossedBelow(series, new Array(series.length).fill(level), withinBars);
}

// ------------------------------------------------------------ candle shapes

export interface CandleShape {
  isBullish: boolean;
  isBearish: boolean;
  bodySize: number;
  upperWick: number;
  lowerWick: number;
  range: number;
}

export function shapeOf(candle: Candle): CandleShape {
  const bodySize = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;
  return {
    isBullish: candle.close > candle.open,
    isBearish: candle.close < candle.open,
    bodySize,
    upperWick: candle.high - Math.max(candle.open, candle.close),
    lowerWick: Math.min(candle.open, candle.close) - candle.low,
    range,
  };
}

/** Hammer: small body in the upper third, lower wick >= 2x the body. */
export function isHammer(candle: Candle): boolean {
  const s = shapeOf(candle);
  if (s.range <= 0) return false;
  return s.lowerWick >= s.bodySize * 2 && s.upperWick <= s.bodySize * 0.8 && s.bodySize / s.range < 0.4;
}

/** Shooting star: the hammer's mirror image at the top of a move. */
export function isShootingStar(candle: Candle): boolean {
  const s = shapeOf(candle);
  if (s.range <= 0) return false;
  return s.upperWick >= s.bodySize * 2 && s.lowerWick <= s.bodySize * 0.8 && s.bodySize / s.range < 0.4;
}

export function isBullishEngulfing(prev: Candle, current: Candle): boolean {
  return (
    prev.close < prev.open &&
    current.close > current.open &&
    current.close >= prev.open &&
    current.open <= prev.close
  );
}

export function isBearishEngulfing(prev: Candle, current: Candle): boolean {
  return (
    prev.close > prev.open &&
    current.close < current.open &&
    current.close <= prev.open &&
    current.open >= prev.close
  );
}

/** Any recognised bullish reversal candle at the last bar. */
export function bullishReversalCandle(candles: Candle[]): string | null {
  const n = candles.length;
  if (n < 2) return null;
  if (isBullishEngulfing(candles[n - 2], candles[n - 1])) return "bullish engulfing";
  if (isHammer(candles[n - 1])) return "hammer";
  return null;
}

export function bearishReversalCandle(candles: Candle[]): string | null {
  const n = candles.length;
  if (n < 2) return null;
  if (isBearishEngulfing(candles[n - 2], candles[n - 1])) return "bearish engulfing";
  if (isShootingStar(candles[n - 1])) return "shooting star";
  return null;
}

/** Last defined value of a series, or NaN. */
export function last(series: number[]): number {
  for (let i = series.length - 1; i >= 0; i--) {
    if (Number.isFinite(series[i])) return series[i];
  }
  return NaN;
}

/** Value `back` bars from the end. */
export function at(series: number[], back: number): number {
  const i = series.length - 1 - back;
  return i >= 0 ? series[i] : NaN;
}
