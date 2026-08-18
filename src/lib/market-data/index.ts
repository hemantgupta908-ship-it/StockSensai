import "server-only";

import { marketDataProviderName } from "@/lib/env";
import { AngelOneMarketDataProvider } from "./angel-one-provider";
import { MockMarketDataProvider } from "./mock-provider";
import { YahooMarketDataProvider } from "./yahoo-provider";
import { supabaseSectorMedianStore } from "./sector-medians";
import { createUniverseCache, fetchStockBundle, withIndianEquityGuard } from "./core";
import type {
  Candle,
  Instrument,
  MarketDataProvider,
  Quote,
  StockDataBundle,
} from "./types";

export * from "./types";
export {
  DAILY_LOOKBACK,
  WEEKLY_LOOKBACK,
  MONTHLY_LOOKBACK,
  INTRADAY_LOOKBACK,
} from "./core";

/**
 * Provider registry.
 *
 * Everything above this line is provider-agnostic. Swapping data sources is a
 * single env var (`MARKET_DATA_PROVIDER`); no call site changes.
 *
 * This module is the *server's* entry point. Constructing a live provider reads
 * credentials, so it stays behind `server-only`; the provider-agnostic universe
 * logic lives in `./core`, which the Android build imports directly to screen
 * on-device against the mock provider.
 */

let cached: MarketDataProvider | null = null;

export function getMarketDataProvider(): MarketDataProvider {
  if (cached) return cached;

  let provider: MarketDataProvider;
  if (marketDataProviderName === "yahoo") {
    // The server has a shared median store; the device falls back to an
    // in-process one. See `sector-median-store.ts`.
    provider = new YahooMarketDataProvider({ sectorMedianStore: supabaseSectorMedianStore });
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
 * Parallel history fetches against a live provider.
 *
 * Measured across the 204-name Nifty 200 universe on Yahoo: 4 → ~340s,
 * 8 → 271s, 12 → 277s. The curve flattens because the provider rate-limits and
 * the backoff absorbs the excess, so pushing past 8 buys nothing and only
 * invites harder throttling. Override with `MARKET_DATA_CONCURRENCY` for a
 * provider with a more generous budget.
 */
export const HISTORY_CONCURRENCY = Number(process.env.MARKET_DATA_CONCURRENCY ?? 8);

/**
 * Fetch everything the strategy engine needs for one stock, in parallel.
 * Returns null when the ticker is unknown or not an Indian listing.
 */
export async function getStockBundle(ticker: string): Promise<StockDataBundle | null> {
  return fetchStockBundle(getMarketDataProvider(), ticker);
}

const universe = createUniverseCache(getMarketDataProvider, () => HISTORY_CONCURRENCY);

/** Bundles for the whole universe. Used by the recommendation engine. */
export async function getUniverseBundles(): Promise<StockDataBundle[]> {
  return universe.get();
}

/** Drop the memoised universe, so the next screen refetches. */
export function invalidateUniverseCache() {
  universe.invalidate();
}

export type { Candle, Instrument, Quote, MarketDataProvider, StockDataBundle };
