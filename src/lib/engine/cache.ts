import "server-only";

import { TRADING_STYLES, type RiskTolerance, type TradingStyle } from "@/lib/strategies/types";
import { generateFeed } from "./recommend";
import type { RecommendationFeed } from "./types";

/**
 * In-process feed cache.
 *
 * Screening the whole universe means running 5 strategies over ~37 instruments
 * with full indicator maths on each, so it is not something to redo on every
 * page load. This is deliberately a simple per-instance memo rather than a
 * distributed cache: the durable copy lives in Supabase, written by the daily
 * cron (see `/api/cron/recompute`), and this just avoids recomputation within a
 * single serverless instance's lifetime.
 */

const TTL_MS = 10 * 60 * 1000;

interface Entry {
  feed: RecommendationFeed;
  expiresAt: number;
}

const cache = new Map<string, Entry>();
/** De-duplicates concurrent misses so a cold start doesn't screen N times. */
const inFlight = new Map<string, Promise<RecommendationFeed>>();

function key(style: TradingStyle, tolerance: RiskTolerance): string {
  return `${style}:${tolerance}`;
}

export async function getCachedFeed(
  style: TradingStyle,
  tolerance: RiskTolerance,
  options: { force?: boolean; isPrewarm?: boolean } = {},
): Promise<RecommendationFeed> {
  const cacheKey = key(style, tolerance);

  if (!options.force) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.feed;

    const pending = inFlight.get(cacheKey);
    if (pending) return pending;
  }

  const promise = generateFeed(style, tolerance)
    .then((feed) => {
      cache.set(cacheKey, { feed, expiresAt: Date.now() + TTL_MS });
      return feed;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, promise);

  // Background pre-warm of the *adjacent* styles, without circular recursion.
  //
  // Deliberately not every other style. `getUniverseBundles` is not memoised, so
  // each screen re-fetches history for the whole universe; warming all four
  // siblings puts five universe fetches through a rate-limited provider at once
  // and starves the request the user is actually waiting on — measured at 68
  // seconds for a tab switch during a cold start. Two neighbours is the same
  // cost this had when there were three styles, and they are the tabs a tap on
  // the switcher can reach.
  //
  // Sequenced rather than fired together for the same reason: one extra
  // universe fetch in flight at a time, never two.
  if (!options.force && !options.isPrewarm) {
    const index = TRADING_STYLES.indexOf(style);
    const neighbours = [TRADING_STYLES[index - 1], TRADING_STYLES[index + 1]].filter(
      (s): s is TradingStyle => s !== undefined,
    );

    void promise
      .then(() =>
        neighbours.reduce(
          (chain, sibling) =>
            chain.then(async () => {
              const sibKey = key(sibling, tolerance);
              if (cache.has(sibKey) || inFlight.has(sibKey)) return;
              await getCachedFeed(sibling, tolerance, { isPrewarm: true });
            }),
          Promise.resolve(),
        ),
      )
      .catch((error) => {
        console.error("[engine] pre-warm failed:", error);
      });
  }

  return promise;
}

export function invalidateFeedCache() {
  cache.clear();
}
