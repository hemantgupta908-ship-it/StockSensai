import "server-only";

import { getMarketDataProvider } from "@/lib/market-data";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase/server";
import { TRADING_STYLES, type RiskTolerance, type TradingStyle } from "@/lib/strategies/types";
import { generateFeed } from "./recommend";
import type { Recommendation, RecommendationFeed } from "./types";

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

/**
 * How old the durable Supabase copy may be before it stops being worth serving.
 *
 * The recompute cron runs on weekdays, so a Monday morning read legitimately
 * sees Friday's rows. Beyond roughly that gap the levels have drifted too far
 * from spot to put in front of anyone, and screening fresh is the better answer
 * even at the cost of the wait.
 */
const DURABLE_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;

interface Entry {
  feed: RecommendationFeed;
  expiresAt: number;
}

/**
 * A client that can read `cached_recommendations`.
 *
 * The anon client suffices — the table carries a public select policy — and is
 * preferred so the durable copy stays readable in environments with no
 * service-role key, which would otherwise send every request down the full
 * live-screen path this cache exists to avoid.
 *
 * It is tried inside its own catch because `getSupabaseServerClient` reads
 * cookies, and that throws outside a request scope. The background screen
 * started by `getCachedFeed` outlives its request, so this is a normal
 * condition here rather than an error, and it must fall through to the
 * service-role client rather than giving up on the cache entirely.
 */
async function readOnlyClient() {
  try {
    const anon = await getSupabaseServerClient();
    if (anon) return anon;
  } catch {
    // No request scope — fall through.
  }
  return getSupabaseAdminClient();
}

/**
 * Read the durable copy the recompute cron writes to `cached_recommendations`.
 *
 * Without this the table is write-only: the cron populates it daily and nothing
 * ever reads it back, so every cold instance pays a full live screen — measured
 * at 104 seconds against Yahoo for the first style — while the user stares at
 * whatever the client had cached from a previous session.
 *
 * Returns null whenever the durable copy cannot be trusted (Supabase absent, no
 * rows for this combination, or rows older than `DURABLE_MAX_AGE_MS`), leaving
 * the caller to screen live.
 */
async function readDurableFeed(
  style: TradingStyle,
  tolerance: RiskTolerance,
): Promise<RecommendationFeed | null> {
  try {
    const supabase = await readOnlyClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("cached_recommendations")
      .select("payload, generated_at")
      .eq("trading_style", style)
      .eq("risk_tolerance", tolerance)
      .order("confidence_score", { ascending: false });

    if (error || !data || data.length === 0) return null;

    const generatedAt = data.reduce(
      (newest, row) => (row.generated_at > newest ? row.generated_at : newest),
      data[0].generated_at as string,
    );

    if (Date.now() - new Date(generatedAt).getTime() > DURABLE_MAX_AGE_MS) return null;

    const provider = getMarketDataProvider();
    // Cheap: instrument metadata only, no history.
    const instruments = await provider.listInstruments();

    return {
      style,
      recommendations: data.map((row) => row.payload as unknown as Recommendation),
      generatedAt,
      dataSource: provider.name,
      isLiveData: provider.isLive,
      universeSize: instruments.length,
    };
  } catch (error) {
    console.error("[engine] durable cache read failed:", error);
    return null;
  }
}

const cache = new Map<string, Entry>();
/** De-duplicates concurrent misses so a cold start doesn't screen N times. */
const inFlight = new Map<string, Promise<RecommendationFeed>>();

function key(style: TradingStyle, tolerance: RiskTolerance): string {
  return `${style}:${tolerance}`;
}

/**
 * Placeholder returned while a screen runs in the background.
 *
 * `universeSize` comes from the instrument list, which is metadata only and
 * costs nothing — the expensive part is the price history behind it.
 */
async function warmingFeed(style: TradingStyle): Promise<RecommendationFeed> {
  const provider = getMarketDataProvider();
  const instruments = await provider.listInstruments().catch(() => []);

  return {
    style,
    recommendations: [],
    generatedAt: new Date().toISOString(),
    dataSource: provider.name,
    isLiveData: provider.isLive,
    universeSize: instruments.length,
    warming: true,
  };
}

/**
 * Feed for one style and tolerance, without ever blocking on a full screen.
 *
 * Screening the Nifty 200 against a live provider takes around four and a half
 * minutes — longer than this route's `maxDuration`, and far longer than a
 * browser will hold a fetch. Awaiting it here does not make the user wait, it
 * makes the request *fail*: the function is killed mid-screen and the client
 * sees a network error, which is exactly what a blank "Couldn't load ideas"
 * screen was. So the order is: memo, then the durable copy the cron maintains,
 * and only if both miss does a screen start — in the background, with a
 * `warming` placeholder returned immediately for the UI to poll against.
 */
export async function getCachedFeed(
  style: TradingStyle,
  tolerance: RiskTolerance,
  options: { force?: boolean; isPrewarm?: boolean } = {},
): Promise<RecommendationFeed> {
  const cacheKey = key(style, tolerance);

  if (!options.force) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.feed;

    // Durable copy before screening live. A cold instance that has to run the
    // full screen leaves the caller waiting minutes, which the UI cannot
    // usefully wait out — so prefer yesterday's rows and let the cron keep them
    // current, exactly as the recompute job's own comment intends.
    const durable = await readDurableFeed(style, tolerance);
    if (durable) {
      cache.set(cacheKey, { feed: durable, expiresAt: Date.now() + TTL_MS });
      return durable;
    }
  }

  // A screen is already running for this combination — report warming rather
  // than joining the wait, which would inherit the same timeout.
  if (inFlight.has(cacheKey)) return warmingFeed(style);

  const promise = generateFeed(style, tolerance)
    .then((feed) => {
      cache.set(cacheKey, { feed, expiresAt: Date.now() + TTL_MS });
      return feed;
    })
    .catch((error) => {
      // Nobody is awaiting this, so an unhandled rejection would take the
      // process down rather than one feed.
      console.error(`[engine] background screen failed for ${cacheKey}:`, error);
      throw error;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, promise);
  // Swallow at the tail: the rejection is already logged above, and this
  // promise is deliberately not returned to the caller.
  void promise.catch(() => {});

  // Background pre-warm of the *adjacent* styles, without circular recursion.
  //
  // `getUniverseBundles` is memoised and de-duplicates concurrent callers, so
  // siblings screened while the first is still warm cost only their own
  // indicator maths — around a third of a second each, against the minutes the
  // fetch takes. The sequencing below is kept anyway: it costs nothing once the
  // universe is shared, and it still holds if the memo has expired.
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

  return warmingFeed(style);
}

export function invalidateFeedCache() {
  cache.clear();
}
