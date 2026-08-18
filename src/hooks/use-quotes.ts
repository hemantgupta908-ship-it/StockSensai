"use client";

import { useEffect, useState } from "react";

import type { Quote } from "@/lib/market-data/types";
import { apiFetch } from "@/lib/mobile/api";

/**
 * Fetches quotes for a set of tickers and returns them keyed by symbol.
 * Used by the watchlist and journal, which need live prices for rows whose
 * identities come from the user's own saved data rather than a feed.
 */
const quotesCache: Record<string, Quote> = {};

export function useQuotes(tickers: string[]) {
  const key = tickers.slice().sort().join(",");

  const [quotes, setQuotes] = useState<Record<string, Quote>>(() => {
    if (!key) return {};
    const initial: Record<string, Quote> = {};
    for (const t of tickers) {
      if (quotesCache[t]) initial[t] = quotesCache[t];
    }
    return initial;
  });

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  /**
   * Whether these prices are real.
   *
   * The endpoint has always reported this and every caller discarded it, which
   * was survivable while the only provider a user could reach was the one their
   * own deployment configured. It stopped being survivable on Android: the APK
   * screens on-device against the *seeded* provider unless it is pointed at a
   * deployment, so a portfolio would render simulated prices — and a P&L
   * computed from them — with nothing on screen saying so. Starts null, meaning
   * "not known yet", which is distinct from a known false.
   */
  const [isLiveData, setIsLiveData] = useState<boolean | null>(null);

  const fetchQuotes = async (isManual = false) => {
    if (!key) {
      setQuotes({});
      return;
    }

    if (isManual) {
      setRefreshing(true);
    } else {
      if (Object.keys(quotes).length === 0) setLoading(true);
    }

    try {
      const response = await apiFetch(`/api/quotes?tickers=${encodeURIComponent(key)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(response.statusText);
      const data = (await response.json()) as { quotes?: Quote[]; isLiveData?: boolean };
      const map: Record<string, Quote> = {};
      if (Array.isArray(data?.quotes)) {
        for (const quote of data.quotes) {
          map[quote.ticker] = quote;
          quotesCache[quote.ticker] = quote;
        }
      }
      setQuotes(map);
      setIsLiveData(data?.isLiveData ?? null);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("[useQuotes] failed:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchQuotes(false);
  }, [key]);

  const refetch = () => fetchQuotes(true);

  return { quotes, loading, refreshing, lastUpdated, refetch, isLiveData };
}
