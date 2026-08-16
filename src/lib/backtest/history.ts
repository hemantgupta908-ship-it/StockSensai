import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import type { Candle, Instrument, Quote, StockDataBundle } from "@/lib/market-data/types";
import { SEED_BY_TICKER } from "@/lib/market-data/seed/instruments";
import { DAILY_LOOKBACK, MONTHLY_LOOKBACK, WEEKLY_LOOKBACK } from "@/lib/market-data";
import { resample } from "./resample";

/**
 * Point-in-time reconstruction of what a strategy could have seen on a past day.
 *
 * The whole value of a backtest rests on this file. A strategy is a pure
 * function of its bundle, so if the bundle handed to it on day T contains one
 * bar from T+1 — or a ratio computed from today's balance sheet — the result is
 * not a measurement, it is the strategy being told the answer. Bugs of that
 * kind do not throw; they produce excellent numbers. Everything here is built
 * so that reaching past T is difficult to express rather than merely discouraged.
 */

const HISTORY_DIR = resolve("data/history");
export const BENCHMARK_TICKER = "NIFTY50";

/** Sessions used for the 52-week high/low on a synthesised quote. */
const YEAR_SESSIONS = 250;

export interface StockHistory {
  ticker: string;
  instrument: Instrument;
  daily: Candle[];
  /** Derived once for the full span, then sliced — never recomputed per day. */
  weekly: Candle[];
  monthly: Candle[];
}

export function availableTickers(): string[] {
  if (!existsSync(HISTORY_DIR)) return [];
  return readdirSync(HISTORY_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((t) => t !== BENCHMARK_TICKER);
}

export function loadDaily(ticker: string): Candle[] | null {
  const path = resolve(HISTORY_DIR, `${ticker}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Candle[];
}

/**
 * Load a ticker's full history and pre-derive its higher timeframes.
 *
 * Weekly and monthly series are computed once over the whole span and then
 * sliced by timestamp, rather than resampled inside the day loop. That is worth
 * several minutes across a full run, and it is also safer: one rollup means one
 * place where bucket boundaries can be wrong.
 */
export function loadHistory(ticker: string): StockHistory | null {
  const daily = loadDaily(ticker);
  if (!daily || daily.length === 0) return null;

  const seed = SEED_BY_TICKER.get(ticker);
  if (!seed) return null;

  const { sim, ...instrument } = seed;
  void sim;

  return {
    ticker,
    instrument,
    daily,
    weekly: resample(daily, "1wk"),
    monthly: resample(daily, "1mo"),
  };
}

/**
 * The quote a strategy would have read at the close of `daily[index]`.
 *
 * Every field is derived from bars at or before `index`. The 52-week extremes
 * in particular are recomputed from the trailing window rather than carried
 * over from a live quote, which would be a year of hindsight in two numbers.
 */
function quoteAt(instrument: Instrument, daily: Candle[], index: number): Quote {
  const bar = daily[index];
  const prev = index > 0 ? daily[index - 1] : bar;

  const from = Math.max(0, index - YEAR_SESSIONS + 1);
  let week52High = -Infinity;
  let week52Low = Infinity;
  for (let i = from; i <= index; i++) {
    if (daily[i].high > week52High) week52High = daily[i].high;
    if (daily[i].low < week52Low) week52Low = daily[i].low;
  }

  const change = bar.close - prev.close;

  return {
    ticker: instrument.ticker,
    exchange: instrument.exchange,
    price: bar.close,
    change,
    changePercent: prev.close !== 0 ? (change / prev.close) * 100 : 0,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    prevClose: prev.close,
    volume: bar.volume,
    week52High,
    week52Low,
    updatedAt: new Date(bar.time * 1000).toISOString(),
  };
}

/** Last position in `series` at or before `time`, or -1. Binary search. */
function indexAtOrBefore(series: Candle[], time: number): number {
  let lo = 0;
  let hi = series.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].time <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * A higher timeframe as it stood at the close of `daily[index]`.
 *
 * The subtle part, and the reason this is not a plain slice. The pre-derived
 * weekly and monthly series are rolled up from the *whole* daily history, so
 * the bucket containing day T was built from that entire week or month —
 * including the sessions after T. Slicing it in and calling it point-in-time
 * hands a strategy standing on a Tuesday the close of the following Friday.
 *
 * The effect is small and entirely invisible: it moves only the newest bar of a
 * 50-period weekly EMA, produces no error, and biases results in the flattering
 * direction. Exactly the kind of thing that makes a backtest confidently wrong.
 *
 * So completed buckets are sliced, and the one still in progress is rebuilt
 * from the daily bars up to T. That also matches the live provider, which
 * returns a partial bar for the current week.
 */
function timeframeAsOf(
  full: Candle[],
  daily: Candle[],
  index: number,
  lookback: number,
): Candle[] {
  const asOf = daily[index].time;
  const bucketIndex = indexAtOrBefore(full, asOf);
  if (bucketIndex < 0) return [];

  const bucketStart = full[bucketIndex].time;
  const completed = full.slice(Math.max(0, bucketIndex - lookback + 1), bucketIndex);

  // Rebuild the in-progress bucket from the sessions it has actually seen.
  let open = Number.NaN;
  let high = -Infinity;
  let low = Infinity;
  let close = Number.NaN;
  let volume = 0;
  let seen = false;

  for (let i = index; i >= 0; i--) {
    const bar = daily[i];
    if (bar.time < bucketStart) break;
    if (!seen) {
      close = bar.close;
      seen = true;
    }
    open = bar.open;
    high = Math.max(high, bar.high);
    low = Math.min(low, bar.low);
    volume += bar.volume;
  }

  if (!seen) return completed;
  return [...completed, { time: bucketStart, open, high, low, close, volume }];
}

/**
 * Assemble the bundle for `history.daily[index]`.
 *
 * `fundamentals` is always null, and that is a deliberate design decision
 * rather than an omission. The provider supplies only *current* ratios — ROE,
 * debt/equity, revenue CAGR, P/E as they stand today — so feeding them to a
 * signal dated four years ago would be asking the screen to pick companies
 * using facts nobody had at the time. The five long-term strategies read those
 * fields and return null when they are absent, so passing null makes them
 * excuse themselves from the backtest instead of producing a flattering,
 * meaningless win rate. The ten swing and positional strategies touch no
 * fundamentals at all and are measured in full.
 */
export function bundleAt(
  history: StockHistory,
  index: number,
  benchmarkDaily: Candle[],
): StockDataBundle {
  const asOf = history.daily[index].time;

  const dailySlice = history.daily.slice(Math.max(0, index - DAILY_LOOKBACK + 1), index + 1);
  const benchmarkEnd = indexAtOrBefore(benchmarkDaily, asOf);

  return {
    instrument: history.instrument,
    quote: quoteAt(history.instrument, history.daily, index),
    daily: dailySlice,
    weekly: timeframeAsOf(history.weekly, history.daily, index, WEEKLY_LOOKBACK),
    monthly: timeframeAsOf(history.monthly, history.daily, index, MONTHLY_LOOKBACK),
    intraday: [],
    fundamentals: null,
    // The benchmark is a daily series, so a plain slice is already point-in-time.
    benchmarkDaily: benchmarkDaily.slice(
      Math.max(0, benchmarkEnd - DAILY_LOOKBACK + 1),
      benchmarkEnd + 1,
    ),
  };
}
