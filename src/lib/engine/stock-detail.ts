/**
 * The stock detail screen's payload.
 *
 * Three places produce it — the server component, the `/api/stock/[ticker]`
 * route a mobile client can call against a deployment, and the on-device engine
 * in the WebView. Sharing the shape and the trimming is what stops the three
 * from drifting into showing subtly different charts for the same stock.
 */

import type { Candle, Fundamentals, Instrument, Quote } from "@/lib/market-data/types";
import type { StrategySignal } from "@/lib/strategies/types";
import type { StockAnalysis } from "./analysis";

/** Bars sent to the client for charting — about 8 months of daily history. */
export const CHART_BARS = 170;

export interface StockDetailPayload {
  instrument: Instrument;
  quote: Quote;
  candles: Candle[];
  weeklyCandles: Candle[];
  monthlyCandles: Candle[];
  fundamentals: Fundamentals | null;
  bullishSignals: StrategySignal[];
  bearishSignals: StrategySignal[];
}

/**
 * Trim a full analysis down to what the screen renders.
 *
 * The engine works on 300 daily bars because the 200 EMA and the 52-week range
 * need them; the chart shows a fraction of that. Sending the rest is a third of
 * a megabyte per stock that nothing draws — over a mobile connection, on a
 * screen the user opens repeatedly.
 */
export function toStockDetailPayload(analysis: StockAnalysis): StockDetailPayload {
  const { bundle, bullishSignals, bearishSignals } = analysis;

  return {
    instrument: bundle.instrument,
    quote: bundle.quote,
    candles: bundle.daily.slice(-CHART_BARS),
    weeklyCandles: bundle.weekly.slice(-CHART_BARS),
    monthlyCandles: bundle.monthly.slice(-CHART_BARS),
    fundamentals: bundle.fundamentals,
    bullishSignals,
    bearishSignals,
  };
}
