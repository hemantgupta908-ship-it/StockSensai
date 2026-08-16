import type { Candle, Fundamentals } from "../types";
import {
  bollinger,
  bullishReversalCandle,
  closes,
  crossedAbove,
  crossedAboveLevel,
  crossedBelowLevel,
  ema,
  findPriceZones,
  last,
  macd,
  percentChange,
  rsi,
  swingLows,
} from "@/lib/indicators";
import { createRng, gaussian, uniform, type Rng } from "./random";
import { BENCHMARK, SECTOR_STATS, type SeedInstrument, type TechnicalScenario } from "./instruments";

/**
 * Synthetic-but-realistic OHLCV generation.
 *
 * Two design decisions matter here:
 *
 * 1. Scenario drift is expressed in units of *daily volatility*, not as a
 *    multiple of annual drift. Annual drift per bar is ~0.05% while daily vol
 *    is ~1.5%, so a drift-multiplier approach is swamped by noise and the
 *    intended patterns never actually appear in the output.
 *
 * 2. After generating, the series is checked against the pattern its scenario
 *    is supposed to contain, and re-seeded if it doesn't. Crossovers have to
 *    land inside the window a strategy looks at, and a random walk won't
 *    reliably put them there.
 *
 * The strategies still run genuine indicator maths over the result and still
 * have to find the signal — this only guarantees there is one to find.
 */

export const TRADING_DAYS = 320;
const SESSION_START_MIN = 9 * 60 + 15; // 09:15 IST
const SESSION_END_MIN = 15 * 60 + 30; // 15:30 IST
export const INTRADAY_BARS_PER_SESSION = (SESSION_END_MIN - SESSION_START_MIN) / 5; // 75 bars

/** Per-bar modifiers applied on top of the instrument's baseline walk. */
interface BarProfile {
  /** Additional drift for this bar, in units of that bar's volatility. */
  driftSigma: number;
  volMult: number;
  volumeMult: number;
}

const NEUTRAL: BarProfile = { driftSigma: 0, volMult: 1, volumeMult: 1 };

/**
 * `age` is bars from the end: 0 is the most recent session.
 *
 * The windows are tuned so the resulting indicator event lands inside the
 * lookback each strategy uses — e.g. a 22-bar advance after a long sag puts the
 * 20/50 EMA crossover roughly 3–8 bars from the end, which is inside the
 * 5-bar window the crossover strategy scans.
 */
function scenarioProfile(scenario: TechnicalScenario, age: number): BarProfile {
  if (age > 80) return NEUTRAL;

  switch (scenario) {
    case "ema-golden-cross":
      if (age > 22) return { driftSigma: -0.3, volMult: 1.0, volumeMult: 0.85 };
      if (age > 3) return { driftSigma: 0.55, volMult: 0.9, volumeMult: 1.35 };
      return { driftSigma: 0.35, volMult: 0.85, volumeMult: 1.5 };

    case "macd-bull-cross":
      if (age > 13) return { driftSigma: -0.38, volMult: 1.0, volumeMult: 0.9 };
      if (age > 2) return { driftSigma: 0.62, volMult: 0.95, volumeMult: 1.25 };
      return { driftSigma: 0.4, volMult: 1.0, volumeMult: 1.4 };

    case "oversold-bounce":
      if (age > 16) return { driftSigma: -0.15, volMult: 1.1, volumeMult: 1.0 };
      if (age > 3) return { driftSigma: -0.95, volMult: 1.7, volumeMult: 1.8 };
      return { driftSigma: 0.85, volMult: 1.25, volumeMult: 1.7 };

    case "overbought-fade":
      if (age > 14) return { driftSigma: 0.2, volMult: 0.9, volumeMult: 1.0 };
      if (age > 2) return { driftSigma: 0.95, volMult: 1.25, volumeMult: 1.5 };
      return { driftSigma: -0.7, volMult: 1.35, volumeMult: 1.5 };

    case "range-breakout":
      // Tight coil, then a decisive break 2–4 sessions ago so the strategy's
      // 4-bar breakout scan still sees it, then a shallow hold/retest.
      if (age > 27) return NEUTRAL;
      if (age > 4) return { driftSigma: 0.02, volMult: 0.3, volumeMult: 0.6 };
      if (age > 1) return { driftSigma: 1.7, volMult: 1.35, volumeMult: 2.9 };
      return { driftSigma: 0.12, volMult: 0.75, volumeMult: 1.6 };

    case "bb-squeeze-breakout":
      // Bandwidth must reach the bottom quintile of its 60-session range.
      if (age > 30) return { driftSigma: 0, volMult: 1.1, volumeMult: 1.0 };
      if (age > 2) return { driftSigma: 0.02, volMult: 0.2, volumeMult: 0.55 };
      return { driftSigma: 1.9, volMult: 1.8, volumeMult: 3.1 };

    case "support-bounce":
      // The shelf itself does the work; drift stays muted so price keeps
      // returning to it rather than trending away.
      if (age > 3) return { driftSigma: -0.12, volMult: 1.15, volumeMult: 1.0 };
      return { driftSigma: 0.5, volMult: 1.0, volumeMult: 1.45 };

    case "gap-up-continuation":
      if (age > 3) return { driftSigma: 0.15, volMult: 1.0, volumeMult: 1.0 };
      return { driftSigma: 0.55, volMult: 1.35, volumeMult: 2.4 };

    case "gap-down-continuation":
      if (age > 3) return { driftSigma: -0.1, volMult: 1.0, volumeMult: 1.0 };
      return { driftSigma: -0.55, volMult: 1.45, volumeMult: 2.5 };

    case "strong-uptrend":
      // A steady advance, accelerating into the last week so the stock also
      // clears the 5-session relative-strength margin against NIFTY.
      if (age > 6) return { driftSigma: 0.3, volMult: 0.9, volumeMult: 1.15 };
      return { driftSigma: 0.72, volMult: 0.95, volumeMult: 1.5 };

    case "intraday-trend-day":
      // Ordinary chart, but the final session is a wide-range trend day. The
      // shaping pass below builds that bar; here we just lift volume into it.
      if (age > 1) return { driftSigma: 0.12, volMult: 1.0, volumeMult: 1.0 };
      return { driftSigma: 0.5, volMult: 1.5, volumeMult: 2.6 };

    case "downtrend":
      return { driftSigma: -0.28, volMult: 1.15, volumeMult: 1.05 };

    case "choppy":
    default:
      return NEUTRAL;
  }
}

/** Trading-session dates ending on the most recent weekday, oldest first. */
export function tradingDates(count: number, endDate = new Date()): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()),
  );
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dates.unshift(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates;
}

function roundTick(price: number): number {
  return Math.round(price * 100) / 100;
}

interface WalkParams {
  basePrice: number;
  annualVol: number;
  annualDrift: number;
  avgVolume: number;
  scenario: TechnicalScenario;
  seed: string;
  bars: number;
}

function generateWalk(params: WalkParams): Candle[] {
  const { basePrice, annualVol, annualDrift, avgVolume, scenario, seed, bars } = params;
  const rng = createRng(seed, "daily");
  const dates = tradingDates(bars);

  const dailyVol = annualVol / Math.sqrt(252);
  const dailyDrift = annualDrift / 252;

  const candles: Candle[] = [];
  let close = basePrice;

  /**
   * Horizontal shelf for the support-bounce scenario. It's anchored to price
   * as it stands 70 sessions out rather than to the starting price — otherwise
   * a year of drift leaves the shelf nowhere near the current range and the
   * strategy never sees a level worth testing.
   */
  let supportLevel = NaN;

  for (let i = 0; i < bars; i++) {
    const age = bars - 1 - i;
    const profile = scenarioProfile(scenario, age);

    if (scenario === "support-bounce" && age === 70) {
      supportLevel = close * uniform(rng, 0.955, 0.985);
    }

    const vol = dailyVol * profile.volMult;
    // Scenario drift is measured in units of this bar's volatility.
    const drift = dailyDrift + profile.driftSigma * vol;
    const shock = gaussian(rng) * vol;
    let nextClose = close * Math.exp(drift - (vol * vol) / 2 + shock);

    if (scenario === "support-bounce" && Number.isFinite(supportLevel) && age <= 70) {
      const floor = supportLevel * uniform(rng, 0.996, 1.004);
      if (nextClose < floor) nextClose = floor + Math.abs(shock) * close * 0.35;
      // Keep it from running away upward either, so the shelf keeps being
      // retested. The channel needs enough headroom for a resistance zone to
      // form meaningfully above the support, or every bounce is a scalp.
      const ceiling = supportLevel * 1.22;
      if (nextClose > ceiling) nextClose = ceiling - Math.abs(shock) * close * 0.3;
    }

    const open = close * Math.exp(gaussian(rng) * vol * 0.35);

    const rangePad = close * vol * uniform(rng, 0.45, 1.15);
    const high = Math.max(open, nextClose) + rangePad * uniform(rng, 0.3, 1.0);
    const low = Math.min(open, nextClose) - rangePad * uniform(rng, 0.3, 1.0);

    const rangePct = (high - low) / close;
    const volumeNoise = Math.exp(gaussian(rng) * 0.28);
    const volume = Math.round(avgVolume * profile.volumeMult * volumeNoise * (0.7 + rangePct * 12));

    candles.push({
      time: Math.floor(dates[i].getTime() / 1000),
      open: roundTick(open),
      high: roundTick(Math.max(high, open, nextClose)),
      low: roundTick(Math.min(low, open, nextClose)),
      close: roundTick(nextClose),
      volume: Math.max(volume, Math.round(avgVolume * 0.15)),
    });

    close = nextClose;
  }

  return applyFinalBarShaping(candles, scenario, createRng(seed, "shape"));
}

/**
 * Patterns defined by the exact geometry of the last bar — a gap, a hammer, an
 * engulfing candle, a wide-range trend day — can't be produced reliably by a
 * random walk, so they're constructed explicitly while staying consistent with
 * the bar before them.
 */
function applyFinalBarShaping(
  candles: Candle[],
  scenario: TechnicalScenario,
  rng: Rng,
): Candle[] {
  if (candles.length < 3) return candles;
  const out = candles.slice();
  const n = out.length;
  const lastBar = { ...out[n - 1] };
  const prev = out[n - 2];

  switch (scenario) {
    case "gap-up-continuation": {
      const gapPct = uniform(rng, 0.022, 0.042);
      lastBar.open = roundTick(prev.close * (1 + gapPct));
      lastBar.low = roundTick(lastBar.open * uniform(rng, 0.996, 0.999));
      lastBar.high = roundTick(lastBar.open * (1 + uniform(rng, 0.014, 0.03)));
      lastBar.close = roundTick(lastBar.low + (lastBar.high - lastBar.low) * uniform(rng, 0.78, 0.94));
      lastBar.volume = Math.round(lastBar.volume * uniform(rng, 1.5, 2.1));
      break;
    }
    case "gap-down-continuation": {
      const gapPct = uniform(rng, 0.022, 0.045);
      lastBar.open = roundTick(prev.close * (1 - gapPct));
      lastBar.high = roundTick(lastBar.open * uniform(rng, 1.001, 1.004));
      lastBar.low = roundTick(lastBar.open * (1 - uniform(rng, 0.014, 0.032)));
      lastBar.close = roundTick(lastBar.low + (lastBar.high - lastBar.low) * uniform(rng, 0.06, 0.24));
      lastBar.volume = Math.round(lastBar.volume * uniform(rng, 1.5, 2.2));
      break;
    }
    case "support-bounce": {
      // Hammer: small body at the top, lower wick at least twice the body.
      const body = lastBar.close * uniform(rng, 0.004, 0.009);
      lastBar.open = roundTick(prev.close * uniform(rng, 0.997, 1.002));
      lastBar.close = roundTick(lastBar.open + body);
      lastBar.high = roundTick(lastBar.close + body * uniform(rng, 0.15, 0.5));
      lastBar.low = roundTick(lastBar.open - body * uniform(rng, 2.4, 3.6));
      lastBar.volume = Math.round(lastBar.volume * uniform(rng, 1.25, 1.7));
      break;
    }
    case "oversold-bounce": {
      // Bullish engulfing.
      lastBar.open = roundTick(prev.close * uniform(rng, 0.992, 0.998));
      lastBar.close = roundTick(prev.open * uniform(rng, 1.004, 1.014));
      lastBar.high = roundTick(lastBar.close * (1 + uniform(rng, 0.002, 0.008)));
      lastBar.low = roundTick(lastBar.open * (1 - uniform(rng, 0.004, 0.012)));
      lastBar.volume = Math.round(lastBar.volume * uniform(rng, 1.35, 1.9));
      break;
    }
    case "overbought-fade": {
      // Bearish engulfing.
      lastBar.open = roundTick(prev.close * uniform(rng, 1.002, 1.008));
      lastBar.close = roundTick(prev.open * uniform(rng, 0.986, 0.996));
      lastBar.low = roundTick(lastBar.close * (1 - uniform(rng, 0.002, 0.008)));
      lastBar.high = roundTick(lastBar.open * (1 + uniform(rng, 0.003, 0.01)));
      lastBar.volume = Math.round(lastBar.volume * uniform(rng, 1.3, 1.8));
      break;
    }
    case "intraday-trend-day": {
      // Wide-range trend day: opens near the low, closes near the high. The
      // intraday bridge then produces a session that establishes an opening
      // range early and holds above VWAP throughout.
      const range = prev.close * uniform(rng, 0.026, 0.042);
      lastBar.open = roundTick(prev.close * uniform(rng, 0.9985, 1.004));
      lastBar.low = roundTick(lastBar.open * (1 - uniform(rng, 0.001, 0.004)));
      lastBar.high = roundTick(lastBar.low + range);
      lastBar.close = roundTick(lastBar.high - range * uniform(rng, 0.04, 0.13));
      lastBar.volume = Math.round(lastBar.volume * uniform(rng, 1.6, 2.4));
      break;
    }
    default:
      return out;
  }

  lastBar.high = roundTick(Math.max(lastBar.high, lastBar.open, lastBar.close));
  lastBar.low = roundTick(Math.min(lastBar.low, lastBar.open, lastBar.close));
  out[n - 1] = lastBar;
  return out;
}

/**
 * Does the generated series actually contain the pattern its scenario promises?
 *
 * These checks intentionally mirror only the *entry trigger* of the matching
 * strategy — not its full condition set. The strategy still has to evaluate
 * volume, trend alignment and reward-to-risk on its own, and can still decline
 * to fire.
 */
function scenarioSatisfied(candles: Candle[], scenario: TechnicalScenario): boolean {
  const price = closes(candles);
  const lastBar = candles[candles.length - 1];

  switch (scenario) {
    case "ema-golden-cross":
      return crossedAbove(ema(price, 20), ema(price, 50), 5) >= 0;

    case "macd-bull-cross": {
      const { macd: line, signal } = macd(price, 12, 26, 9);
      return crossedAbove(line, signal, 4) >= 0 && lastBar.close > last(ema(price, 50));
    }

    case "oversold-bounce":
      return crossedAboveLevel(rsi(price, 14), 30, 3) >= 0 && bullishReversalCandle(candles) !== null;

    case "overbought-fade":
      return crossedBelowLevel(rsi(price, 14), 70, 3) >= 0;

    case "range-breakout": {
      // Same scan the breakout strategy performs.
      for (let back = 0; back <= 3; back++) {
        const breakIndex = candles.length - 1 - back;
        const base = candles.slice(breakIndex - 20, breakIndex);
        if (base.length < 20) continue;
        const high = Math.max(...base.map((c) => c.high));
        const low = Math.min(...base.map((c) => c.low));
        if (((high - low) / low) * 100 <= 12 && candles[breakIndex].close > high) return true;
      }
      return false;
    }

    case "bb-squeeze-breakout": {
      const { upper, bandwidth } = bollinger(price, 20, 2);
      const recent = bandwidth.slice(-60).filter(Number.isFinite);
      if (recent.length < 40) return false;
      const sorted = [...recent].sort((a, b) => a - b);
      const cutoff = sorted[Math.floor(sorted.length * 0.2)];
      const squeeze = Math.min(...bandwidth.slice(-6, -1).filter(Number.isFinite));
      return squeeze <= cutoff && lastBar.close > last(upper);
    }

    case "support-bounce": {
      const window = candles.slice(-120);
      const zones = findPriceZones(window, swingLows(window, 3), (c) => c.low, 0.02);
      return zones.some(
        (z) => z.touches >= 3 && Math.abs(lastBar.close - z.level) / z.level <= 0.03,
      );
    }

    case "gap-up-continuation":
      return (lastBar.open - candles[candles.length - 2].close) / candles[candles.length - 2].close >= 0.015;

    case "gap-down-continuation":
      return (candles[candles.length - 2].close - lastBar.open) / candles[candles.length - 2].close >= 0.015;

    case "strong-uptrend": {
      // Near the 52-week high, above the long trend, and running hard enough
      // over five sessions to clear the relative-strength margin.
      const high52 = Math.max(...candles.slice(-250).map((c) => c.high));
      const ema200 = last(ema(price, 200));
      const ret5 = percentChange(price, 5);
      return (
        lastBar.close > ema200 &&
        (high52 - lastBar.close) / high52 <= 0.1 &&
        Number.isFinite(ret5) &&
        ret5 >= 4
      );
    }

    case "intraday-trend-day": {
      const range = lastBar.high - lastBar.low;
      return range > 0 && (lastBar.close - lastBar.low) / range >= 0.85;
    }

    case "downtrend":
    case "choppy":
    default:
      return true;
  }
}

/** How many re-seeds to try before accepting whatever the walk produced. */
const MAX_SEED_ATTEMPTS = 24;

export function generateDailyCandles(seed: SeedInstrument, bars = TRADING_DAYS): Candle[] {
  const base = {
    basePrice: seed.sim.basePrice,
    annualVol: seed.sim.annualVol,
    annualDrift: seed.sim.annualDrift,
    avgVolume: seed.sim.avgVolume,
    scenario: seed.sim.scenario,
    bars,
  };

  let fallback: Candle[] | null = null;
  for (let attempt = 0; attempt < MAX_SEED_ATTEMPTS; attempt++) {
    const candles = generateWalk({
      ...base,
      seed: attempt === 0 ? seed.ticker : `${seed.ticker}#${attempt}`,
    });
    if (scenarioSatisfied(candles, seed.sim.scenario)) return candles;
    fallback ??= candles;
  }

  // No seed produced the pattern. Return the first attempt: the strategy simply
  // won't fire for this stock, which is a legitimate outcome.
  return fallback!;
}

export function generateBenchmarkCandles(bars = TRADING_DAYS): Candle[] {
  return generateWalk({
    basePrice: BENCHMARK.basePrice,
    annualVol: BENCHMARK.annualVol,
    annualDrift: BENCHMARK.annualDrift,
    avgVolume: 0,
    scenario: "choppy",
    seed: BENCHMARK.ticker,
    bars,
  });
}

/**
 * Five-minute bars for the most recent `sessions` days.
 *
 * The path is a Brownian bridge pinned to the daily bar's open and close, then
 * rescaled so its extremes match the daily high and low. Intraday and daily
 * views therefore agree — VWAP and opening-range figures reconcile with the
 * candle the user sees on the daily chart.
 */
export function generateIntradayCandles(
  seed: SeedInstrument,
  daily: Candle[],
  sessions = 3,
): Candle[] {
  const out: Candle[] = [];
  const relevant = daily.slice(-sessions);

  for (const day of relevant) {
    const rng = createRng(seed.ticker, "intraday", day.time);
    const steps = INTRADAY_BARS_PER_SESSION;

    const path: number[] = [day.open];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const target = day.open + (day.close - day.open) * t;
      const bridgeVol = Math.sqrt(t * (1 - t)) * (day.high - day.low) * 0.55;
      path.push(target + gaussian(rng) * bridgeVol);
    }
    path[path.length - 1] = day.close;

    const rawHigh = Math.max(...path);
    const rawLow = Math.min(...path);
    const mid = (day.high + day.low) / 2;
    const rawMid = (rawHigh + rawLow) / 2;
    const scale = rawHigh - rawLow > 1e-9 ? (day.high - day.low) / (rawHigh - rawLow) : 1;
    const scaled = path.map((p) => mid + (p - rawMid) * scale);
    scaled[0] = day.open;
    scaled[scaled.length - 1] = day.close;

    // Track session extremes so breakout bars can carry a genuine volume
    // surge. Without this, the U-shaped intraday volume curve means every
    // mid-session breakout looks *below* average and no ORB signal can fire —
    // which is an artefact of the model, not how breakouts actually trade.
    let runningHigh = -Infinity;
    let runningLow = Infinity;

    for (let i = 0; i < steps; i++) {
      const barOpen = scaled[i];
      const barClose = scaled[i + 1];
      const wick = Math.abs(barClose - barOpen) * uniform(rng, 0.15, 0.6) + day.close * 0.0004;
      const barHigh = Math.max(barOpen, barClose) + wick * rng();
      const barLow = Math.min(barOpen, barClose) - wick * rng();

      const t = i / steps;
      const uShape = 1.9 * Math.exp(-6 * t) + 1.5 * Math.exp(-7 * (1 - t)) + 0.55;

      let breakoutBoost = 1;
      if (i >= 3) {
        if (barHigh > runningHigh) breakoutBoost = uniform(rng, 1.5, 2.3);
        else if (barLow < runningLow) breakoutBoost = uniform(rng, 1.4, 2.1);
      }

      const barVolume = Math.round(
        (day.volume / steps) * uShape * breakoutBoost * Math.exp(gaussian(rng) * 0.22),
      );

      runningHigh = Math.max(runningHigh, barHigh);
      runningLow = Math.min(runningLow, barLow);

      const minute = SESSION_START_MIN + i * 5;
      // Daily `time` is midnight UTC of the session date; IST is UTC+5:30.
      const timestamp = day.time + (minute - 330) * 60;

      out.push({
        time: timestamp,
        open: roundTick(barOpen),
        high: roundTick(Math.max(barHigh, barOpen, barClose)),
        low: roundTick(Math.min(barLow, barOpen, barClose)),
        close: roundTick(barClose),
        volume: Math.max(barVolume, 100),
      });
    }
  }

  return out;
}

/**
 * Fundamentals derived from the instrument's archetype plus its explicit
 * anchors. Derived series — profit history, dividend history, margin trend —
 * are internally consistent with the CAGRs so the long-term strategies see
 * coherent inputs.
 */
export function generateFundamentals(seed: SeedInstrument, currentPrice: number): Fundamentals {
  const rng = createRng(seed.ticker, "fundamentals");
  const { archetype, pe, pb, roe, debtToEquity, dividendYield, themes } = seed.sim;

  const growthBand: Record<string, [number, number]> = {
    "deep-value": [5, 10],
    "quality-growth": [12, 18],
    "dividend-payer": [7, 12],
    "high-growth": [20, 31],
    "thematic-growth": [18, 28],
    cyclical: [1, 7],
    "expensive-quality": [6, 11],
    leveraged: [8, 14],
  };
  const [gLow, gHigh] = growthBand[archetype] ?? [8, 14];
  const revenueCagr3y = Number(uniform(rng, gLow, gHigh).toFixed(1));
  const earningsSpread = archetype === "cyclical" ? uniform(rng, -6, 2) : uniform(rng, 1.5, 6.5);
  const earningsCagr3y = Number((revenueCagr3y + earningsSpread).toFixed(1));

  const marginBase =
    archetype === "expensive-quality"
      ? uniform(rng, 20, 26)
      : archetype === "cyclical" || archetype === "leveraged"
        ? uniform(rng, 9, 15)
        : uniform(rng, 15, 22);
  const marginStep =
    archetype === "cyclical"
      ? uniform(rng, -1.6, -0.2)
      : archetype === "high-growth" || archetype === "thematic-growth"
        ? uniform(rng, 0.6, 1.8)
        : uniform(rng, -0.2, 0.9);
  const operatingMarginTrend = [0, 1, 2].map((i) => Number((marginBase + marginStep * i).toFixed(1)));

  // Generated entries have no researched market cap (`marketCapCr: 0`) and
  // carry a simulation-only stand-in instead, so the demo still produces
  // believable profit figures without publishing an invented capitalisation.
  const simMarketCapCr = seed.sim.marketCapCr ?? seed.marketCapCr;
  const currentProfit = simMarketCapCr / Math.max(pe, 1);
  const profitHistory = [4, 3, 2, 1, 0].map((yearsAgo) => {
    const base = currentProfit / Math.pow(1 + earningsCagr3y / 100, yearsAgo);
    const noise = archetype === "cyclical" ? uniform(rng, 0.72, 1.3) : uniform(rng, 0.94, 1.06);
    return Number((base * noise).toFixed(0));
  });

  const currentDps = (dividendYield / 100) * currentPrice;
  const dividendGrowth =
    archetype === "dividend-payer"
      ? uniform(rng, 0.09, 0.16)
      : archetype === "cyclical"
        ? uniform(rng, -0.05, 0.14)
        : uniform(rng, 0.03, 0.11);
  const dividendHistory = [5, 4, 3, 2, 1, 0].map((yearsAgo, idx) => {
    const base = currentDps / Math.pow(1 + dividendGrowth, yearsAgo);
    const noise = archetype === "dividend-payer" ? 1 : idx % 3 === 1 ? uniform(rng, 0.82, 0.99) : 1;
    return Number((base * noise).toFixed(2));
  });

  const eps = currentPrice / Math.max(pe, 1);
  const payoutRatio = eps > 0 ? Number(Math.min((currentDps / eps) * 100, 95).toFixed(1)) : 0;

  const roce = Number(
    Math.min(roe / (1 + 0.42 * debtToEquity) + uniform(rng, -1.5, 3.5), 78).toFixed(1),
  );

  const interestCoverage =
    debtToEquity < 0.05
      ? Number(uniform(rng, 22, 60).toFixed(1))
      : Number(Math.max(1.1, 9 / Math.max(debtToEquity, 0.1) + uniform(rng, -1.5, 2)).toFixed(1));

  const sector = SECTOR_STATS[seed.sector] ?? { pe: 25, pb: 4 };

  return {
    ticker: seed.ticker,
    peRatio: pe,
    pbRatio: pb,
    sectorPe: sector.pe,
    sectorPb: sector.pb,
    roe,
    roce,
    debtToEquity,
    dividendYield,
    dividendHistory,
    payoutRatio,
    revenueCagr3y,
    earningsCagr3y,
    operatingMarginTrend,
    profitHistory,
    promoterHolding: Number(uniform(rng, 26, 74).toFixed(2)),
    promoterPledge: archetype === "leveraged" ? Number(uniform(rng, 2, 18).toFixed(2)) : 0,
    interestCoverage,
    themes,
    earningsPerShare: Number(eps.toFixed(2)),
    bookValuePerShare: Number((currentPrice / Math.max(pb, 0.1)).toFixed(2)),
  };
}
