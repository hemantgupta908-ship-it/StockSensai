"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSession } from "@/components/auth/session-provider";

export interface PortfolioEntry {
  id: string;
  ticker: string;
  name: string;
  exchange: string;
  quantity: number;
  entryPrice: number;
  entryDate: string;
  strategyId: string | null;
  tradingStyle: string | null;
  /** What the app suggested when the position was logged, for later comparison. */
  recommendedBuyLow: number | null;
  recommendedBuyHigh: number | null;
  recommendedSellLow: number | null;
  recommendedSellHigh: number | null;
  recommendedStopLoss: number | null;
  exitPrice: number | null;
  exitDate: string | null;
  note: string | null;
}

export type NewPortfolioEntry = Omit<PortfolioEntry, "id">;

interface PortfolioValue {
  entries: PortfolioEntry[];
  loading: boolean;
  add: (entry: NewPortfolioEntry) => Promise<void>;
  update: (id: string, updates: Partial<PortfolioEntry>) => Promise<void>;
  close: (id: string, exitPrice: number, exitDate: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  isLocal: boolean;
}

const PortfolioContext = createContext<PortfolioValue | null>(null);
const STORAGE_KEY = "stocksensei.portfolio";

function readLocal(): PortfolioEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PortfolioEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(entries: PortfolioEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromRow(row: any): PortfolioEntry {
  return {
    id: row.id,
    ticker: row.ticker,
    name: row.name,
    exchange: row.exchange,
    quantity: Number(row.quantity),
    entryPrice: Number(row.entry_price),
    entryDate: row.entry_date,
    strategyId: row.strategy_id,
    tradingStyle: row.trading_style,
    recommendedBuyLow: row.recommended_buy_low,
    recommendedBuyHigh: row.recommended_buy_high,
    recommendedSellLow: row.recommended_sell_low,
    recommendedSellHigh: row.recommended_sell_high,
    recommendedStopLoss: row.recommended_stop_loss,
    exitPrice: row.exit_price,
    exitDate: row.exit_date,
    note: row.note,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Trade journal. Same Supabase-or-local pattern as the watchlist.
 *
 * The point of storing the recommendation snapshot alongside the actual fill is
 * that it lets the journal answer the only question that matters: did following
 * the plan work, and did you actually follow it?
 */
export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const { user, authEnabled } = useSession();
  const [entries, setEntries] = useState<PortfolioEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const isLocal = !authEnabled || !user;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const supabase = getSupabaseBrowserClient();

      if (!supabase || !user) {
        if (!cancelled) {
          setEntries(readLocal());
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("portfolio_entries")
        .select("*")
        .order("entry_date", { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error("[portfolio] load failed, falling back to local:", error.message);
        setEntries(readLocal());
      } else {
        setEntries((data ?? []).map(fromRow));
      }
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const add = useCallback(
    async (entry: NewPortfolioEntry) => {
      const supabase = getSupabaseBrowserClient();

      if (supabase && user) {
        const { data, error } = await supabase
          .from("portfolio_entries")
          .insert({
            user_id: user.id,
            ticker: entry.ticker,
            name: entry.name,
            exchange: entry.exchange,
            quantity: entry.quantity,
            entry_price: entry.entryPrice,
            entry_date: entry.entryDate,
            strategy_id: entry.strategyId,
            trading_style: entry.tradingStyle,
            recommended_buy_low: entry.recommendedBuyLow,
            recommended_buy_high: entry.recommendedBuyHigh,
            recommended_sell_low: entry.recommendedSellLow,
            recommended_sell_high: entry.recommendedSellHigh,
            recommended_stop_loss: entry.recommendedStopLoss,
            exit_price: entry.exitPrice,
            exit_date: entry.exitDate,
            note: entry.note,
          })
          .select()
          .single();

        if (error) {
          console.error("[portfolio] add failed:", error.message);
          return;
        }
        setEntries((current) => [fromRow(data), ...current]);
        return;
      }

      const local: PortfolioEntry = { ...entry, id: crypto.randomUUID() };
      setEntries((current) => {
        const next = [local, ...current];
        writeLocal(next);
        return next;
      });
    },
    [user],
  );

  const update = useCallback(
    async (id: string, updates: Partial<PortfolioEntry>) => {
      setEntries((current) => {
        const next = current.map((e) => (e.id === id ? { ...e, ...updates } : e));
        const supabase = getSupabaseBrowserClient();
        if (!supabase || !user) writeLocal(next);
        return next;
      });

      const supabase = getSupabaseBrowserClient();
      if (supabase && user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dbUpdates: any = {};
        if (updates.quantity !== undefined) dbUpdates.quantity = updates.quantity;
        if (updates.entryPrice !== undefined) dbUpdates.entry_price = updates.entryPrice;
        if (updates.entryDate !== undefined) dbUpdates.entry_date = updates.entryDate;
        if (updates.note !== undefined) dbUpdates.note = updates.note;
        if (updates.tradingStyle !== undefined) dbUpdates.trading_style = updates.tradingStyle;
        if (updates.exitPrice !== undefined) dbUpdates.exit_price = updates.exitPrice;
        if (updates.exitDate !== undefined) dbUpdates.exit_date = updates.exitDate;

        const { error } = await supabase
          .from("portfolio_entries")
          .update(dbUpdates)
          .eq("id", id);
        if (error) console.error("[portfolio] update failed:", error.message);
      }
    },
    [user],
  );

  const close = useCallback(
    async (id: string, exitPrice: number, exitDate: string) => {
      setEntries((current) => {
        const next = current.map((e) => (e.id === id ? { ...e, exitPrice, exitDate } : e));
        const supabase = getSupabaseBrowserClient();
        if (!supabase || !user) writeLocal(next);
        return next;
      });

      const supabase = getSupabaseBrowserClient();
      if (supabase && user) {
        const { error } = await supabase
          .from("portfolio_entries")
          .update({ exit_price: exitPrice, exit_date: exitDate })
          .eq("id", id);
        if (error) console.error("[portfolio] close failed:", error.message);
      }
    },
    [user],
  );

  const remove = useCallback(
    async (id: string) => {
      setEntries((current) => {
        const next = current.filter((e) => e.id !== id);
        const supabase = getSupabaseBrowserClient();
        if (!supabase || !user) writeLocal(next);
        return next;
      });

      const supabase = getSupabaseBrowserClient();
      if (supabase && user) {
        const { error } = await supabase.from("portfolio_entries").delete().eq("id", id);
        if (error) console.error("[portfolio] remove failed:", error.message);
      }
    },
    [user],
  );

  return (
    <PortfolioContext.Provider value={{ entries, loading, add, update, close, remove, isLocal }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio(): PortfolioValue {
  const context = useContext(PortfolioContext);
  if (!context) throw new Error("usePortfolio must be used inside PortfolioProvider");
  return context;
}
