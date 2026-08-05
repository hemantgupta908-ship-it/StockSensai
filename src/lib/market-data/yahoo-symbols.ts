/**
 * Yahoo symbol mapping for the curated universe.
 *
 * Deliberately a module of its own rather than living in `yahoo-provider.ts`:
 * that file is `server-only`, and `scripts/check-symbols.ts` has to import this
 * mapping to validate it. Duplicating the logic in the script would let the two
 * drift, which is precisely the failure this guards against.
 */

/**
 * Provider-specific symbol fixes.
 *
 * Corporate actions rename tickers and Yahoo follows its own timeline. Keeping
 * the map here rather than editing the curated universe means the demo data
 * keeps its familiar names while live lookups still resolve.
 *
 * A symbol missing from here does not fail loudly — the fetch 404s, the bundle
 * is dropped, and the instrument silently disappears from every screen. Two of
 * these were costing the live universe two stocks before anyone noticed, so
 * `npm run check:symbols` now verifies the whole list resolves.
 *
 * - TATAMOTORS: the group demerged, and Yahoo now lists the passenger-vehicle
 *   entity as TMPV. The old symbol returns "may be delisted".
 * - ZOMATO: renamed to Eternal Limited, trading as ETERNAL. The ISIN is
 *   unchanged. Kept as ZOMATO in the universe because that is still the name
 *   people search for.
 *
 * A symbol that was simply *wrong* in the universe does not belong here — it is
 * wrong for every provider, and the ticker is what URLs and saved watchlist
 * entries key on — so those are corrected at source instead.
 */
export const SYMBOL_OVERRIDES: Record<string, string> = {
  TATAMOTORS: "TMPV.NS",
  ZOMATO: "ETERNAL.NS",
};

/** NSE trades in `.NS`, BSE in `.BO`. */
export function toYahooSymbol(ticker: string, exchange: string): string {
  return SYMBOL_OVERRIDES[ticker] ?? `${ticker}${exchange === "BSE" ? ".BO" : ".NS"}`;
}
