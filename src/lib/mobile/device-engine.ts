/**
 * The strategy engine, running inside the WebView.
 *
 * This is what makes the APK self-contained. It screens against **live** Yahoo
 * data when the device can reach it — using `marketDataFetch`, which performs
 * the request in native code and so is not blocked by CORS — and falls back to
 * the seeded provider when it cannot. Either way the ranking is the shared
 * `buildFeed` out of `@/lib/engine/analysis`, so a strategy change reaches both
 * builds at once.
 *
 * No deployment is required for any of this. That matters beyond convenience: an
 * app on the Play Store cannot ask its users to paste a server URL, and one that
 * hard-depends on a server the developer pays for silently degrades for everyone
 * the day that server goes away.
 *
 * There are no track records on-device (they live in Supabase behind the
 * service-role key), so confidence is untilted. `applyWinRate` returns the score
 * unchanged for a strategy with no record, which is exactly the state a fresh
 * deployment is in — so the numbers match the web app's out-of-the-box output
 * rather than approximating it.
 */

import {
  fetchStockBundle,
  fetchUniverseBundles,
  withIndianEquityGuard,
  UNIVERSE_TTL_MS,
} from "@/lib/market-data/core";
import { MockMarketDataProvider } from "@/lib/market-data/mock-provider";
import { YahooMarketDataProvider } from "@/lib/market-data/yahoo-provider";
import type {
  Instrument,
  MarketDataProvider,
  Quote,
  StockDataBundle,
} from "@/lib/market-data/types";
import {
  buildFeed,
  buildStockAnalysis,
  type ProviderMeta,
  type StockAnalysis,
  type StrategyRecord,
} from "@/lib/engine/analysis";
import type { RecommendationFeed } from "@/lib/engine/types";
import type { RiskTolerance, TradingStyle } from "@/lib/strategies/types";
import type { FetchLike } from "./native-http";

/** A symbol liquid enough that failing to quote it means Yahoo, not the stock. */
const PROBE_TICKER = "RELIANCE";

/**
 * How this module reaches the network, and whether live data is possible at all.
 *
 * Injected rather than imported, because this file usually runs *inside a Web
 * Worker* and a worker cannot answer either question for itself: Capacitor
 * injects its bridge into the main window only, so `globalThis.Capacitor` is
 * undefined here and any plugin call is unreachable. Reading it directly is
 * exactly the bug that made the app fall back to seeded prices while reporting
 * no error — it looked for a native platform from the one context guaranteed not
 * to have one.
 *
 * The worker is handed a fetch that proxies to the main thread; the inline
 * fallback path passes the real one straight through.
 */
interface DevicePlatform {
  fetch: FetchLike;
  isNative: boolean;
}

let platform: DevicePlatform = {
  // Defaults are the safe ones: no native bridge, ordinary fetch. A caller that
  // never configures the platform gets seeded data rather than requests that
  // silently fail CORS.
  fetch: (url, init) => fetch(url, init),
  isNative: false,
};

export function configureDevicePlatform(next: DevicePlatform): void {
  platform = next;
  // A platform change invalidates the provider choice that was made under the
  // old one — otherwise the seeded provider picked before configuration would
  // be held for the rest of the session.
  active = null;
  resolving = null;
}

let active: MarketDataProvider | null = null;
let resolving: Promise<MarketDataProvider> | null = null;

function seeded(): MarketDataProvider {
  return withIndianEquityGuard(new MockMarketDataProvider());
}

/**
 * Pick a provider once, by asking for a single quote.
 *
 * A probe rather than a capability check, because "can reach Yahoo" is not
 * something the platform can answer: the endpoints are undocumented, they get
 * locked down, and a phone can sit on a captive-portal Wi-Fi that resolves DNS
 * and serves a login page for everything. One real quote settles it for the cost
 * of one request.
 *
 * The choice is then held for the session. Re-probing per screen would put a
 * network round trip in front of every navigation, and flipping providers
 * mid-session is worse than either answer — the feed would silently change what
 * its numbers mean.
 */
async function resolveProvider(): Promise<MarketDataProvider> {
  if (active) return active;

  resolving ??= (async () => {
    // Off-native there is no way past CORS, so seeded data is the only option.
    if (platform.isNative) {
      try {
        const yahoo = withIndianEquityGuard(
          new YahooMarketDataProvider({ fetch: platform.fetch }),
        );
        const quote = await yahoo.getQuote(PROBE_TICKER);
        if (quote && quote.price > 0) {
          console.info("[device-engine] live market data (yahoo)");
          active = yahoo;
          return yahoo;
        }
        console.warn("[device-engine] yahoo answered without a price — using seeded data");
      } catch (error) {
        console.warn(
          `[device-engine] yahoo unreachable, using seeded data: ${(error as Error).message}`,
        );
      }
    }

    active = seeded();
    return active;
  })();

  return resolving;
}

export async function getDeviceProvider(): Promise<MarketDataProvider> {
  return resolveProvider();
}

/**
 * Parallel history fetches.
 *
 * Deliberately lower than the server's 8. This is someone's phone on someone's
 * mobile data, so the ceiling that matters is not how fast Yahoo will answer but
 * how much of their battery and data allowance a cold screen is entitled to. The
 * seeded provider is pure computation and is capped separately, at 50, inside
 * `fetchUniverseBundles`.
 */
const HISTORY_CONCURRENCY = 4;

let universeCache: { bundles: StockDataBundle[]; expiresAt: number } | null = null;
let universeInFlight: Promise<StockDataBundle[]> | null = null;

async function getUniverse(): Promise<StockDataBundle[]> {
  if (universeCache && universeCache.expiresAt > Date.now()) return universeCache.bundles;
  if (universeInFlight) return universeInFlight;

  universeInFlight = (async () => {
    const provider = await resolveProvider();
    let bundles = await fetchUniverseBundles(provider, HISTORY_CONCURRENCY);

    // A live provider that answered the probe can still fail the screen — rate
    // limited part-way through, or connectivity lost. An empty feed is
    // indistinguishable from "no setups today", which would be a lie, so fall
    // back rather than present nothing.
    if (bundles.length === 0 && provider.isLive) {
      console.warn("[device-engine] live screen returned nothing — falling back to seeded data");
      active = seeded();
      bundles = await fetchUniverseBundles(active, HISTORY_CONCURRENCY);
    }

    if (bundles.length > 0) {
      universeCache = { bundles, expiresAt: Date.now() + UNIVERSE_TTL_MS };
    }
    return bundles;
  })().finally(() => {
    universeInFlight = null;
  });

  return universeInFlight;
}

/** No Supabase on-device, so no realised track records to tilt by. */
const NO_RECORDS = new Map<string, StrategyRecord>();

async function meta(): Promise<ProviderMeta> {
  const provider = await resolveProvider();
  return { name: provider.name, isLive: provider.isLive };
}

/**
 * Feed cache, mirroring the server's.
 *
 * Screening the universe is the most expensive thing the app does, so a style the
 * user has already looked at must not be rescreened when they tab back to it. The
 * TTL matches the universe cache's, so a feed can never outlive the price history
 * it was built from.
 */
const feedCache = new Map<string, { feed: RecommendationFeed; expiresAt: number }>();
const feedInFlight = new Map<string, Promise<RecommendationFeed>>();

export async function deviceFeed(
  style: TradingStyle,
  tolerance: RiskTolerance,
  options: { force?: boolean } = {},
): Promise<RecommendationFeed> {
  const key = `${style}:${tolerance}`;

  if (options.force) {
    feedCache.delete(key);
    universeCache = null;
  } else {
    const hit = feedCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.feed;
    // Join an in-flight screen rather than starting a second one. On-device
    // there is no request timeout to inherit, so waiting is strictly better
    // than the server's `warming` placeholder.
    const pending = feedInFlight.get(key);
    if (pending) return pending;
  }

  const run = (async () => {
    const [bundles, provider] = await Promise.all([getUniverse(), meta()]);
    const feed = buildFeed(bundles, style, tolerance, NO_RECORDS, provider);
    feedCache.set(key, { feed, expiresAt: Date.now() + UNIVERSE_TTL_MS });
    return feed;
  })().finally(() => {
    feedInFlight.delete(key);
  });

  feedInFlight.set(key, run);
  return run;
}

export async function deviceAnalyseStock(
  ticker: string,
  tolerance: RiskTolerance,
): Promise<StockAnalysis | null> {
  const provider = await resolveProvider();
  const bundle = await fetchStockBundle(provider, ticker);
  if (!bundle) return null;
  return buildStockAnalysis(bundle, tolerance, NO_RECORDS, await meta());
}

export async function deviceQuotes(tickers: string[]): Promise<Quote[]> {
  return (await resolveProvider()).getQuotes(tickers);
}

/** Whether the quotes and levels this device serves are real prices. */
export async function deviceIsLive(): Promise<boolean> {
  return (await resolveProvider()).isLive;
}

export async function deviceInstruments(
  tickers: string[],
): Promise<Record<string, Instrument>> {
  const provider = await resolveProvider();
  const settled = await Promise.allSettled(
    tickers.map((ticker) => provider.getInstrument(ticker)),
  );

  const result: Record<string, Instrument> = {};
  for (const outcome of settled) {
    if (outcome.status === "fulfilled" && outcome.value) {
      result[outcome.value.ticker] = outcome.value;
    }
  }
  return result;
}

export async function deviceListInstruments(): Promise<Instrument[]> {
  return (await resolveProvider()).listInstruments();
}

/** Drop every memo, so the next screen regenerates from scratch. */
export function invalidateDeviceCaches() {
  feedCache.clear();
  universeCache = null;
}
