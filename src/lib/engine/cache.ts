import "server-only";

import type { RiskTolerance, TradingStyle } from "@/lib/strategies/types";
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

  // Background pre-warm sibling styles safely without circular recursion
  if (!options.force && !options.isPrewarm) {
    const styles: TradingStyle[] = ["swing", "short-term", "long-term"];
    for (const s of styles) {
      if (s !== style) {
        const sibKey = key(s, tolerance);
        if (!cache.has(sibKey) && !inFlight.has(sibKey)) {
          void getCachedFeed(s, tolerance, { isPrewarm: true });
        }
      }
    }
  }

  return promise;
}

export function invalidateFeedCache() {
  cache.clear();
}
