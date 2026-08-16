"use client";

import { useEffect, useRef } from "react";
import { useWatchlist } from "@/components/watchlist/watchlist-provider";
import { useQuotes } from "@/hooks/use-quotes";

export function usePriceAlerts() {
  const { items } = useWatchlist();
  const tickers = items.map(i => i.ticker);
  const { quotes } = useQuotes(tickers);
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Request permission on mount if it hasn't been granted/denied
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    items.forEach(item => {
      const quote = quotes[item.ticker];
      if (!quote) return;

      const price = quote.price;

      if (item.alertAbove && price >= item.alertAbove) {
        const key = `${item.ticker}-above-${item.alertAbove}`;
        if (!notifiedRef.current.has(key)) {
          new Notification(`Price Alert: ${item.ticker}`, {
            body: `${item.ticker} has crossed above ₹${item.alertAbove}. Current price is ₹${price}.`,
          });
          notifiedRef.current.add(key);
        }
      }

      if (item.alertBelow && price <= item.alertBelow) {
        const key = `${item.ticker}-below-${item.alertBelow}`;
        if (!notifiedRef.current.has(key)) {
          new Notification(`Price Alert: ${item.ticker}`, {
            body: `${item.ticker} has dropped below ₹${item.alertBelow}. Current price is ₹${price}.`,
          });
          notifiedRef.current.add(key);
        }
      }
    });
  }, [items, quotes]);
}

export function PriceAlertsMonitor() {
  usePriceAlerts();
  return null;
}
