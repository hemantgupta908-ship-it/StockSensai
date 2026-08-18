/**
 * Provider-agnostic universe logic, with no environment reads and no
 * `server-only` marker.
 *
 * Everything here used to live in `index.ts`. It moved because the Android
 * build runs the same screening on-device: there is no Node process behind the
 * WebView, so the mock provider, the Indian-equity guard and the bundle fetch
 * all have to be reachable from client code. `index.ts` still owns the one
 * thing that genuinely is server-side — reading `MARKET_DATA_PROVIDER` and
 * constructing a live provider from credentials — and delegates the rest here.
 *
 * The split is what keeps the two builds honest. A guard or a lookback that
 * differed between web and mobile would show the same stock a different signal
 * on each, so neither build gets its own copy.
 */

import { createLimiter } from "./rate-limit";
import type { Instrument, MarketDataProvider, StockDataBundle } from "./types";
import { isIndianExchange } from "./types";

/** Bars of daily history the strategy engine needs (52-week high/low + indicators). */
export const DAILY_LOOKBACK = 300;
/** Weekly bars (approx 3 years). */
export const WEEKLY_LOOKBACK = 150;
/** Monthly bars (approx 5 years). */
export const MONTHLY_LOOKBACK = 60;
/** Five-minute bars covering the last three sessions. */
export const INTRADAY_LOOKBACK = 225;

/** Minimum daily bars before a stock is worth screening at all. */
const MIN_DAILY_BARS = 60;

/**
 * Defence in depth for the NSE/BSE-only constraint.
 *
 * Providers are contractually required to return Indian instruments only, but
 * a misconfigured live feed could leak a US or global symbol into the universe.
 * This wrapper drops anything that isn't NSE/BSE listed before it reaches the
 * strategy engine or the UI.
 */
export function withIndianEquityGuard(provider: MarketDataProvider): MarketDataProvider {
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
    prepareUniverse: provider.prepareUniverse?.bind(provider),
  };
}

export function isSupportedInstrument(instrument: Instrument): boolean {
  if (!isIndianExchange(instrument.exchange)) return false;
  // Indian ISINs are issued under the "IN" country prefix.
  if (instrument.isin && !instrument.isin.startsWith("IN")) return false;
  return true;
}

/**
 * Fetch everything the strategy engine needs for one stock, in parallel.
 * Returns null when the ticker is unknown or not an Indian listing.
 */
export async function fetchStockBundle(
  provider: MarketDataProvider,
  ticker: string,
): Promise<StockDataBundle | null> {
  const symbol = ticker.toUpperCase();

  // Intraday bars are not fetched: no strategy reads them and the detail screen
  // charts daily, weekly and monthly. It was a whole request per page view for
  // data with no consumer.
  const [instrument, quote, daily, weekly, monthly, fundamentals, benchmarkDaily] =
    await Promise.all([
      provider.getInstrument(symbol),
      provider.getQuote(symbol),
      provider.getCandles({ ticker: symbol, interval: "1d", limit: DAILY_LOOKBACK }),
      provider.getCandles({ ticker: symbol, interval: "1wk", limit: WEEKLY_LOOKBACK }),
      provider.getCandles({ ticker: symbol, interval: "1mo", limit: MONTHLY_LOOKBACK }),
      provider.getFundamentals(symbol),
      provider.getBenchmarkCandles(DAILY_LOOKBACK),
    ]);

  // Fundamentals may legitimately be null (brokerage feeds don't carry them);
  // the long-term strategies handle that. Price history is non-negotiable.
  if (!instrument || !quote || daily.length < MIN_DAILY_BARS) return null;

  return {
    instrument,
    quote,
    daily,
    weekly,
    monthly,
    intraday: [],
    fundamentals,
    benchmarkDaily,
  };
}

/**
 * Bundles for the whole universe.
 *
 * Written to minimise *requests*, not just wall-clock time. Naively mapping
 * `fetchStockBundle` over the universe issues one quote call per stock and
 * re-fetches the identical NIFTY series once per stock — for 37 instruments
 * that's ~148 simultaneous requests where ~80 sequenced ones will do. Against a
 * live feed the naive version is throttled immediately.
 */
export async function fetchUniverseBundles(
  provider: MarketDataProvider,
  historyConcurrency: number,
): Promise<StockDataBundle[]> {
  const instruments = await provider.listInstruments();
  if (instruments.length === 0) return [];

  // Universe-wide warm-up belongs here and nowhere else: this is the one path
  // that was always going to touch every instrument anyway.
  await provider.prepareUniverse?.();

  // Quotes batch into a single request, and the benchmark is shared by every
  // stock — both belong outside the per-instrument loop.
  const [quotes, benchmarkDaily] = await Promise.all([
    provider.getQuotes(instruments.map((i) => i.ticker)),
    provider.getBenchmarkCandles(DAILY_LOOKBACK),
  ]);

  const quoteByTicker = new Map(quotes.map((q) => [q.ticker, q]));
  const limit = createLimiter(provider.isLive ? historyConcurrency : 50);

  const bundles = await Promise.all(
    instruments.map(async (instrument): Promise<StockDataBundle | null> => {
      const quote = quoteByTicker.get(instrument.ticker);
      if (!quote) return null;

      try {
        // Intraday bars are deliberately not fetched here — no surviving
        // strategy reads them, and against a live feed the request was a
        // quarter of the screen's entire network cost for data nothing
        // consumes. `fetchStockBundle` still skips them too.
        const [daily, weekly, monthly, fundamentals] = await Promise.all([
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
          provider.getFundamentals(instrument.ticker),
        ]);

        if (daily.length < MIN_DAILY_BARS) return null;
        return {
          instrument,
          quote,
          daily,
          weekly,
          monthly,
          intraday: [],
          fundamentals,
          benchmarkDaily,
        };
      } catch (error) {
        // One bad symbol must not sink the whole screen.
        console.error(`[market-data] dropping ${instrument.ticker}:`, error);
        return null;
      }
    }),
  );

  return bundles.filter((b): b is StockDataBundle => b !== null);
}

/**
 * How long a fetched universe is reused.
 *
 * Matches the feed cache's TTL, so a card can never be built from price history
 * older than the feed that carries it claims to be.
 */
export const UNIVERSE_TTL_MS = 10 * 60 * 1000;

/**
 * Memoises one universe fetch, shared by concurrent callers.
 *
 * A factory rather than module state because the server build and the on-device
 * build each want their own instance — the alternative is a cache keyed by a
 * provider that never changes within a process, which is the same thing with
 * more moving parts.
 */
export function createUniverseCache(
  provider: () => MarketDataProvider,
  historyConcurrency: () => number,
) {
  let cache: { bundles: StockDataBundle[]; expiresAt: number } | null = null;
  /** Shared by concurrent callers so one screen's fetch is never duplicated. */
  let inFlight: Promise<StockDataBundle[]> | null = null;

  return {
    async get(): Promise<StockDataBundle[]> {
      if (cache && cache.expiresAt > Date.now()) return cache.bundles;
      if (inFlight) return inFlight;

      inFlight = fetchUniverseBundles(provider(), historyConcurrency())
        .then((bundles) => {
          // An empty result is a failure, not a universe — caching it would
          // starve every screen for the whole TTL.
          if (bundles.length > 0) {
            cache = { bundles, expiresAt: Date.now() + UNIVERSE_TTL_MS };
          }
          return bundles;
        })
        .finally(() => {
          inFlight = null;
        });

      return inFlight;
    },

    /** Drop the memoised universe, so the next screen refetches. */
    invalidate() {
      cache = null;
    },
  };
}
