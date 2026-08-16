import type { Candle } from "@/lib/market-data/types";

/**
 * Aggregate daily bars into weekly or monthly ones.
 *
 * The backtest derives every higher timeframe from the same daily array it
 * slices for the daily series, rather than fetching them separately. Fetched
 * weekly bars are stamped with the *start* of their week, so filtering them by
 * "timestamp <= today" hands a strategy a week that has not finished trading —
 * a lookahead bug that produces flattering results and no error. Deriving them
 * makes that impossible to express: a bucket can only ever contain days the
 * caller already sliced.
 *
 * The final bucket is deliberately allowed to be partial. That matches what the
 * live provider returns mid-week, so a backtested signal sees the same shape of
 * data as a live one.
 */

/** Epoch seconds → UTC midnight of that day. NSE bars are stamped 09:15 IST
 *  (03:45 UTC), so the UTC and IST calendar dates agree. */
function utcDate(timeSeconds: number): Date {
  const d = new Date(timeSeconds * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Monday of the week containing `date`, as epoch seconds. */
function weekStart(date: Date): number {
  const day = date.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return Math.floor(monday.getTime() / 1000);
}

/** First of the month containing `date`, as epoch seconds. */
function monthStart(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
}

export type Timeframe = "1wk" | "1mo";

/**
 * `daily` must be oldest-first. Buckets carry the open of their first session,
 * the close of their last, the extremes across all of them, and summed volume —
 * the standard OHLCV rollup.
 */
export function resample(daily: Candle[], timeframe: Timeframe): Candle[] {
  if (daily.length === 0) return [];

  const bucketOf = timeframe === "1wk" ? weekStart : monthStart;
  const out: Candle[] = [];
  let current: Candle | null = null;
  let currentKey = Number.NaN;

  for (const bar of daily) {
    const key = bucketOf(utcDate(bar.time));

    if (current === null || key !== currentKey) {
      if (current) out.push(current);
      currentKey = key;
      current = {
        time: key,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      };
      continue;
    }

    current.high = Math.max(current.high, bar.high);
    current.low = Math.min(current.low, bar.low);
    current.close = bar.close;
    current.volume += bar.volume;
  }

  if (current) out.push(current);
  return out;
}
