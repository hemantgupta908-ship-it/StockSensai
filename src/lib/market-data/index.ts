import "server-only";

import { marketDataProviderName } from "@/lib/env";
import { AngelOneMarketDataProvider } from "./angel-one-provider";
import { MockMarketDataProvider } from "./mock-provider";
import { YahooMarketDataProvider } from "./yahoo-provider";
import { createLimiter } from "./rate-limit";
import type {
  Candle,
  Instrument,
  MarketDataProvider,
  Quote,
  StockDataBundle,
} from "./types";
import { isIndianExchange } from "./types";

export * from "./types";

/**
 * Provider registry.
 *
 * Everything above this line is provider-agnostic. Swapping data sources is a
 * single env var (`MARKET_DATA_PROVIDER`); no call site changes.
 */

let cached: MarketDataProvider | null = null;

export function getMarketDataProvider(): MarketDataProvider {
  if (cached) return cached;

  let provider: MarketDataProvider;
  if (marketDataProviderName === "yahoo") {
    provider = new YahooMarketDataProvider();
  } else if (marketDataProviderName === "angelone") {
    try {
      provider = new AngelOneMarketDataProvider();
    } catch (error) {
      // Missing or malformed credentials must degrade to the demo provider
      // rather than taking the whole app down.
      console.warn(
        `[market-data] falling back to mock provider: ${(error as Error).message}`,
      );
      provider = new MockMarketDataProvider();
    }
  } else {
    provider = new MockMarketDataProvider();
  }

  cached = withIndianEquityGuard(provider);
  return cached;
}

/**
 * Defence in depth for the NSE/BSE-only constraint.
 *
 * Providers are contractually required to return Indian instruments only, but
 * a misconfigured live feed could leak a US or global symbol into the universe.
 * This wrapper drops anything that isn't NSE/BSE listed before it reaches the
 * strategy engine or the UI.
 */
function withIndianEquityGuard(provider: MarketDataProvider): MarketDataProvider {
  return {
    name: provider.name,
    isLive: provider.isLive,

    async listInstruments() {
      const all = await provider.listInstruments();
      return all.filter(isSupportedInstrument);
    },

    async getInstrument(ticker) {
      const instrument = await provider.getInstrument(ticker);
      return instrument && isSupportedInstrument(instrument) ? instrument : null;
    },

    async getQuote(ticker) {
      const quote = await provider.getQuote(ticker);
      return quote && isIndianExchange(quote.exchange) ? quote : null;
    },

    async getQuotes(tickers) {
      const quotes = await provider.getQuotes(tickers);
      return quotes.filter((q) => isIndianExchange(q.exchange));
    },

    getCandles: (request) => provider.getCandles(request),
    getFundamentals: (ticker) => provider.getFundamentals(ticker),
    getBenchmarkCandles: (limit) => provider.getBenchmarkCandles(limit),
    isMarketOpen: () => provider.isMarketOpen(),
  };
}

function isSupportedInstrument(instrument: Instrument): boolean {
  if (!isIndianExchange(instrument.exchange)) return false;
  // Indian ISINs are issued under the "IN" country prefix.
  if (instrument.isin && !instrument.isin.startsWith("IN")) return false;
  return true;
}

/** Bars of daily history the strategy engine needs (52-week high/low + indicators). */
export const DAILY_LOOKBACK = 300;
/** Weekly bars (approx 3 years). */
export const WEEKLY_LOOKBACK = 150;
/** Monthly bars (approx 5 years). */
export const MONTHLY_LOOKBACK = 60;
/** Five-minute bars covering the last three sessions. */
export const INTRADAY_LOOKBACK = 225;

/**
 * Fetch everything the strategy engine needs for one stock, in parallel.
 * Returns null when the ticker is unknown or not an Indian listing.
 */
export async function getStockBundle(ticker: string): Promise<StockDataBundle | null> {
  const provider = getMarketDataProvider();
  const symbol = ticker.toUpperCase();

  const [instrument, quote, daily, weekly, monthly, intraday, fundamentals, benchmarkDaily] = await Promise.all([
    provider.getInstrument(symbol),
    provider.getQuote(symbol),
    provider.getCandles({ ticker: symbol, interval: "1d", limit: DAILY_LOOKBACK }),
    provider.getCandles({ ticker: symbol, interval: "1wk", limit: WEEKLY_LOOKBACK }),
    provider.getCandles({ ticker: symbol, interval: "1mo", limit: MONTHLY_LOOKBACK }),
    provider.getCandles({ ticker: symbol, interval: "5m", limit: INTRADAY_LOOKBACK }),
    provider.getFundamentals(symbol),
    provider.getBenchmarkCandles(DAILY_LOOKBACK),
  ]);

  // Fundamentals may legitimately be null (brokerage feeds don't carry them);
  // the long-term strategies handle that. Price history is non-negotiable.
  if (!instrument || !quote || daily.length < 60) return null;

  return { instrument, quote, daily, weekly, monthly, intraday, fundamentals, benchmarkDaily };
}

/**
 * How many historical-candle requests may be in flight at once.
 *
 * Historical endpoints are the most tightly rate-limited part of every Indian
 * brokerage API, and they're the one call here that genuinely can't be batched
 * (each symbol needs its own request). Keep this low; raising it buys a faster
 * cold screen and risks a throttle that costs far more.
 */
export const HISTORY_CONCURRENCY = Number(process.env.MARKET_DATA_CONCURRENCY ?? 4);

/**
 * Bundles for the whole universe. Used by the recommendation engine.
 *
 * Written to minimise *requests*, not just wall-clock time. Naively mapping
 * `getStockBundle` over the universe issues one quote call per stock and
 * re-fetches the identical NIFTY series once per stock — for 37 instruments
 * that's ~148 simultaneous requests where ~80 sequenced ones will do. Against a
 * live feed the naive version is throttled immediately.
 */
export async function getUniverseBundles(): Promise<StockDataBundle[]> {
  const provider = getMarketDataProvider();
  const instruments = await provider.listInstruments();
  if (instruments.length === 0) return [];

  // Quotes batch into a single request, and the benchmark is shared by every
  // stock — both belong outside the per-instrument loop.
  const [quotes, benchmarkDaily] = await Promise.all([
    provider.getQuotes(instruments.map((i) => i.ticker)),
    provider.getBenchmarkCandles(DAILY_LOOKBACK),
  ]);

  const quoteByTicker = new Map(quotes.map((q) => [q.ticker, q]));
  const limit = createLimiter(provider.isLive ? HISTORY_CONCURRENCY : 50);

  const bundles = await Promise.all(
    instruments.map(async (instrument): Promise<StockDataBundle | null> => {
      const quote = quoteByTicker.get(instrument.ticker);
      if (!quote) return null;

      try {
        const [daily, weekly, monthly, intraday, fundamentals] = await Promise.all([
          limit(() =>
            provider.getCandles({
              ticker: instrument.ticker,
              interval: "1d",
              limit: DAILY_LOOKBACK,
            }),
          ),
          limit(() =>
            provider.getCandles({
              ticker: instrument.ticker,
              interval: "1wk",
              limit: WEEKLY_LOOKBACK,
            }),
          ),
          limit(() =>
            provider.getCandles({
              ticker: instrument.ticker,
              interval: "1mo",
              limit: MONTHLY_LOOKBACK,
            }),
          ),
          limit(() =>
            provider.getCandles({
              ticker: instrument.ticker,
              interval: "5m",
              limit: INTRADAY_LOOKBACK,
            }),
          ),
          provider.getFundamentals(instrument.ticker),
        ]);

        if (daily.length < 60) return null;
        return { instrument, quote, daily, weekly, monthly, intraday, fundamentals, benchmarkDaily };
      } catch (error) {
        // One bad symbol must not sink the whole screen.
        console.error(`[market-data] dropping ${instrument.ticker}:`, error);
        return null;
      }
    }),
  );

  return bundles.filter((b): b is StockDataBundle => b !== null);
}

export type { Candle, Instrument, Quote, MarketDataProvider, StockDataBundle };
