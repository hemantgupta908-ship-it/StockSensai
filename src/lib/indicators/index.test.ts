/**
 * Indicator arithmetic.
 *
 * Two invariants matter more than any individual number here:
 *
 *  1. Warm-up values are `NaN`, never 0. A zeroed moving average manufactures
 *     phantom crossovers, which is the difference between a screen that fires
 *     on a real signal and one that fires on its own warm-up window.
 *  2. Output length always equals input length, so a caller indexing by bar
 *     never silently reads a neighbouring bar's value.
 */

import { describe, expect, it } from "vitest";

import type { Candle } from "@/lib/market-data/types";
import {
  atr,
  bollinger,
  crossedAbove,
  crossedAboveLevel,
  crossedBelow,
  ema,
  highestHigh,
  lowestLow,
  macd,
  percentChange,
  rsi,
  sma,
} from "./index";

/** A candle series from close prices; range is a fixed band around each close. */
function candles(closeSeries: number[]): Candle[] {
  return closeSeries.map((close, i) => ({
    time: 1700000000 + i * 86400,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000,
  })) as Candle[];
}

const RISING = Array.from({ length: 40 }, (_, i) => 100 + i);

describe("sma", () => {
  it("returns NaN through the warm-up and a value from the period-th bar", () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(out.slice(0, 2).every(Number.isNaN)).toBe(true);
    expect(out[2]).toBe(2);
    expect(out[4]).toBe(4);
  });

  it("never emits 0 during warm-up", () => {
    expect(sma([5, 5, 5, 5], 3).slice(0, 2)).toEqual([NaN, NaN]);
  });

  it("matches the input length", () => {
    expect(sma(RISING, 10)).toHaveLength(RISING.length);
  });

  it("returns all NaN when the series is shorter than the period", () => {
    expect(sma([1, 2], 5).every(Number.isNaN)).toBe(true);
  });

  it("returns all NaN for a non-positive period rather than dividing by zero", () => {
    expect(sma([1, 2, 3], 0).every(Number.isNaN)).toBe(true);
  });

  it("tracks a constant series exactly", () => {
    const out = sma([7, 7, 7, 7, 7], 3);
    expect(out[4]).toBe(7);
  });

  it("does not drift over a long series", () => {
    // The rolling sum adds and subtracts; error would accumulate if it drifted.
    const out = sma(RISING, 5);
    expect(out[39]).toBeCloseTo((135 + 136 + 137 + 138 + 139) / 5, 10);
  });
});

describe("ema", () => {
  it("seeds with the SMA of the first period values", () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out[2]).toBe(2); // (1+2+3)/3
  });

  it("keeps warm-up as NaN", () => {
    expect(ema([1, 2, 3, 4, 5], 3).slice(0, 2).every(Number.isNaN)).toBe(true);
  });

  it("weights recent values more heavily than an SMA", () => {
    const values = [...Array(20).fill(100), 200];
    const e = ema(values, 10);
    const s = sma(values, 10);
    expect(e[20]).toBeGreaterThan(s[20]);
  });

  it("converges to a constant series", () => {
    expect(ema(Array(50).fill(42), 10)[49]).toBeCloseTo(42, 8);
  });

  it("matches the input length", () => {
    expect(ema(RISING, 12)).toHaveLength(RISING.length);
  });
});

describe("rsi", () => {
  it("is 100 when every bar rises", () => {
    // No losses means avgLoss is 0, which the guard maps to 100 rather than
    // dividing by zero.
    expect(rsi(RISING, 14)[39]).toBe(100);
  });

  it("is 0 when every bar falls", () => {
    const falling = Array.from({ length: 40 }, (_, i) => 200 - i);
    expect(rsi(falling, 14)[39]).toBeCloseTo(0, 6);
  });

  it("sits near 50 for a symmetric zigzag", () => {
    const zigzag = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 === 0 ? 0 : 1));
    const value = rsi(zigzag, 14)[59];
    expect(value).toBeGreaterThan(40);
    expect(value).toBeLessThan(60);
  });

  it("first emits at index period, not earlier", () => {
    const out = rsi(RISING, 14);
    expect(Number.isNaN(out[13])).toBe(true);
    expect(Number.isFinite(out[14])).toBe(true);
  });

  it("stays within 0..100", () => {
    const noisy = Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 3) * 10 + (i % 7));
    for (const v of rsi(noisy, 14).filter(Number.isFinite)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("returns all NaN when the series is too short", () => {
    expect(rsi([1, 2, 3], 14).every(Number.isNaN)).toBe(true);
  });

  it("uses Wilder smoothing, not a plain EMA", () => {
    // Wilder's alpha is 1/period; an EMA's is 2/(period+1). The distinction is
    // the whole reason this function is hand-rolled, so it is pinned against
    // both formulas computed independently from their definitions.
    const period = 14;
    // A walk with genuine gains *and* losses — without losses avgLoss is 0 and
    // every formula collapses to 100, which distinguishes nothing.
    const series = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 2) * 8 + i * 0.3);

    const referenceRsi = (alpha: number) => {
      let avgGain = 0;
      let avgLoss = 0;
      for (let i = 1; i <= period; i++) {
        const d = series[i] - series[i - 1];
        if (d >= 0) avgGain += d;
        else avgLoss -= d;
      }
      avgGain /= period;
      avgLoss /= period;
      for (let i = period + 1; i < series.length; i++) {
        const d = series[i] - series[i - 1];
        avgGain = avgGain * (1 - alpha) + (d > 0 ? d : 0) * alpha;
        avgLoss = avgLoss * (1 - alpha) + (d < 0 ? -d : 0) * alpha;
      }
      return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    };

    const actual = rsi(series, period)[series.length - 1];
    expect(actual).toBeCloseTo(referenceRsi(1 / period), 8);
    // And is measurably not the EMA-smoothed variant.
    expect(Math.abs(actual - referenceRsi(2 / (period + 1)))).toBeGreaterThan(0.5);
  });
});

describe("macd", () => {
  it("returns three series of the input length", () => {
    const out = macd(RISING);
    expect(out.macd).toHaveLength(RISING.length);
    expect(out.signal).toHaveLength(RISING.length);
    expect(out.histogram).toHaveLength(RISING.length);
  });

  it("keeps the macd line NaN until the slow EMA has warmed up", () => {
    const out = macd(RISING, 12, 26, 9);
    expect(Number.isNaN(out.macd[24])).toBe(true);
    expect(Number.isFinite(out.macd[25])).toBe(true);
  });

  it("is positive when fast leads slow in an uptrend", () => {
    expect(macd(RISING).macd[39]).toBeGreaterThan(0);
  });

  it("keeps histogram equal to macd minus signal where both exist", () => {
    const out = macd(RISING);
    for (let i = 0; i < out.macd.length; i++) {
      if (Number.isFinite(out.macd[i]) && Number.isFinite(out.signal[i])) {
        expect(out.histogram[i]).toBeCloseTo(out.macd[i] - out.signal[i], 10);
      }
    }
  });
});

describe("bollinger", () => {
  it("collapses to the mean for a constant series", () => {
    const out = bollinger(Array(30).fill(50), 20, 2);
    expect(out.middle[29]).toBeCloseTo(50, 10);
    expect(out.upper[29]).toBeCloseTo(50, 10);
    expect(out.lower[29]).toBeCloseTo(50, 10);
  });

  it("orders the bands lower <= middle <= upper", () => {
    const noisy = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i) * 5);
    const out = bollinger(noisy, 20, 2);
    for (let i = 19; i < noisy.length; i++) {
      expect(out.lower[i]).toBeLessThanOrEqual(out.middle[i]);
      expect(out.middle[i]).toBeLessThanOrEqual(out.upper[i]);
    }
  });

  it("keeps warm-up NaN", () => {
    expect(Number.isNaN(bollinger(Array(30).fill(50), 20).middle[18])).toBe(true);
  });
});

describe("atr", () => {
  it("is never negative", () => {
    const out = atr(candles(Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 5)));
    for (const v of out.filter(Number.isFinite)) expect(v).toBeGreaterThanOrEqual(0);
  });

  it("equals the constant range of a flat series", () => {
    // Each candle spans close-1 .. close+1, so the true range is exactly 2.
    const out = atr(candles(Array(40).fill(100)), 14);
    expect(out[39]).toBeCloseTo(2, 6);
  });

  it("keeps warm-up NaN", () => {
    expect(Number.isNaN(atr(candles(Array(40).fill(100)), 14)[0])).toBe(true);
  });
});

describe("crossings", () => {
  it("detects a fast series crossing above a slow one", () => {
    const fast = [1, 2, 3, 4, 9, 10];
    const slow = [5, 5, 5, 5, 5, 5];
    expect(crossedAbove(fast, slow, 3)).toBeGreaterThanOrEqual(0);
  });

  it("does not report a cross that never happened", () => {
    const below = [1, 1, 1, 1, 1, 1];
    const above = [5, 5, 5, 5, 5, 5];
    expect(crossedAbove(below, above, 3)).toBeLessThan(0);
  });

  it("detects a cross below", () => {
    const falling = [9, 8, 7, 6, 1];
    const level = [5, 5, 5, 5, 5];
    expect(crossedBelow(falling, level, 3)).toBeGreaterThanOrEqual(0);
  });

  it("ignores a cross older than the lookback window", () => {
    const fast = [1, 9, 9, 9, 9, 9, 9, 9, 9, 9];
    const slow = Array(10).fill(5);
    expect(crossedAbove(fast, slow, 2)).toBeLessThan(0);
  });

  it("does not treat a NaN warm-up as a crossing", () => {
    // The whole reason warm-up is NaN: [NaN, NaN, 6] against a level of 5 must
    // not read as "crossed up from 0".
    const series = [NaN, NaN, 6];
    expect(crossedAboveLevel(series, 5, 3)).toBeLessThan(0);
  });
});

describe("highestHigh / lowestLow", () => {
  it("finds the extremes of the window", () => {
    const c = candles([10, 20, 15, 30, 25]);
    expect(highestHigh(c, 5)).toBe(31); // 30 + 1
    expect(lowestLow(c, 5)).toBe(9); // 10 - 1
  });

  it("respects an explicit end index", () => {
    const c = candles([10, 20, 15, 30, 25]);
    expect(highestHigh(c, 2, 2)).toBe(21);
  });
});

describe("percentChange", () => {
  it("computes the change over the given number of bars", () => {
    expect(percentChange([100, 110], 1)).toBeCloseTo(10, 6);
  });

  it("is negative on a decline", () => {
    expect(percentChange([100, 90], 1)).toBeCloseTo(-10, 6);
  });

  it("is zero for a flat series", () => {
    expect(percentChange([100, 100], 1)).toBe(0);
  });
});
