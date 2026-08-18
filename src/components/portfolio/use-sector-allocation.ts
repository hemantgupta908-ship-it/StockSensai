import { useState, useEffect } from "react";
import type { PortfolioEntry } from "./portfolio-provider";
import type { Instrument } from "@/lib/market-data/types";
import { apiFetch } from "@/lib/mobile/api";

export interface SectorAllocation {
  sector: string;
  investedValue: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
  industries: Record<string, IndustryAllocation>;
}

export interface IndustryAllocation {
  industry: string;
  investedValue: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
  tickers: string[];
}

/**
 * Sector and industry are immutable properties of a listing, so they are cached
 * for the lifetime of the tab. Without this the hook refetches the whole
 * instrument set every time a quote refreshes — metadata that cannot have
 * changed, re-requested on a price tick.
 */
const instrumentCache = new Map<string, Instrument>();

export function useSectorAllocation(entries: PortfolioEntry[], quotes: Record<string, { price: number }>) {
  const [allocation, setAllocation] = useState<SectorAllocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchAndCalculate() {
      const openEntries = entries.filter((e) => e.exitPrice === null);
      if (openEntries.length === 0) {
        setAllocation([]);
        setLoading(false);
        return;
      }

      const tickers = Array.from(new Set(openEntries.map((e) => e.ticker)));
      const missing = tickers.filter((t) => !instrumentCache.has(t));

      try {
        if (missing.length > 0) {
          const res = await apiFetch(`/api/instruments?tickers=${missing.join(",")}`);
          if (!res.ok) throw new Error("Failed to fetch instruments");

          const fetched: Record<string, Instrument> = await res.json();
          if (cancelled) return;
          for (const [ticker, instrument] of Object.entries(fetched)) {
            instrumentCache.set(ticker, instrument);
          }
        }

        const instrumentMap: Record<string, Instrument> = {};
        for (const ticker of tickers) {
          const cached = instrumentCache.get(ticker);
          if (cached) instrumentMap[ticker] = cached;
        }

        const sectors: Record<string, SectorAllocation> = {};

        openEntries.forEach((entry) => {
          const instrument = instrumentMap[entry.ticker];
          const sectorName = instrument?.sector || "Other";
          const industryName = instrument?.industry || "Other";
          
          const investedVal = entry.quantity * entry.entryPrice;
          const currentPrice = quotes[entry.ticker]?.price ?? entry.entryPrice;
          const currentVal = entry.quantity * currentPrice;
          const pnl = currentVal - investedVal;

          if (!sectors[sectorName]) {
            sectors[sectorName] = {
              sector: sectorName,
              investedValue: 0,
              currentValue: 0,
              pnl: 0,
              pnlPct: 0,
              industries: {},
            };
          }

          const sector = sectors[sectorName];
          sector.investedValue += investedVal;
          sector.currentValue += currentVal;
          sector.pnl += pnl;

          if (!sector.industries[industryName]) {
            sector.industries[industryName] = {
              industry: industryName,
              investedValue: 0,
              currentValue: 0,
              pnl: 0,
              pnlPct: 0,
              tickers: [],
            };
          }

          const ind = sector.industries[industryName];
          ind.investedValue += investedVal;
          ind.currentValue += currentVal;
          ind.pnl += pnl;
          if (!ind.tickers.includes(entry.ticker)) {
            ind.tickers.push(entry.ticker);
          }
        });

        // Calculate percentages and flatten
        const result = Object.values(sectors).map((s) => {
          s.pnlPct = s.investedValue > 0 ? (s.pnl / s.investedValue) * 100 : 0;
          Object.values(s.industries).forEach((ind) => {
            ind.pnlPct = ind.investedValue > 0 ? (ind.pnl / ind.investedValue) * 100 : 0;
          });
          return s;
        });

        // Sort by invested value descending
        result.sort((a, b) => b.investedValue - a.investedValue);

        setAllocation(result);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load sector allocation", err);
        // Clear rather than leave the previous portfolio's breakdown on screen
        // looking like a current one.
        setAllocation([]);
        setLoading(false);
      }
    }

    fetchAndCalculate();

    return () => {
      cancelled = true;
    };
  }, [entries, quotes]);

  return { allocation, loading };
}
