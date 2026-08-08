"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSession } from "@/components/auth/session-provider";

export interface WatchlistItem {
  ticker: string;
  name: string;
  exchange: string;
  priceAtAddition?: number;
  createdAt: string;
}

interface WatchlistValue {
  items: WatchlistItem[];
  loading: boolean;
  has: (ticker: string) => boolean;
  toggle: (item: Omit<WatchlistItem, "createdAt">) => Promise<void>;
  remove: (ticker: string) => Promise<void>;
  /** True when persisting to browser storage rather than Supabase. */
  isLocal: boolean;
}

const WatchlistContext = createContext<WatchlistValue | null>(null);

const STORAGE_KEY = "stocksensei.watchlist";

function readLocal(): WatchlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WatchlistItem[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(items: WatchlistItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/**
 * Watchlist backed by Supabase when the user is signed in, and by browser
 * storage otherwise.
 *
 * The local fallback is what makes the app demoable with no backend at all. On
 * first sign-in, anything saved locally is migrated up to the account rather
 * than being silently discarded.
 */
export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const { user, authEnabled } = useSession();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const isLocal = !authEnabled || !user;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const supabase = getSupabaseBrowserClient();

      if (!supabase || !user) {
        if (!cancelled) {
          setItems(readLocal());
          setLoading(false);
        }
        return;
      }

      // Migrate any locally saved rows into the account on first load.
      const local = readLocal();
      if (local.length > 0) {
        await supabase.from("watchlist_items").upsert(
          local.map((item) => ({
            user_id: user.id,
            ticker: item.ticker,
            name: item.name,
            exchange: item.exchange,
            price_at_addition: item.priceAtAddition ?? null,
          })),
          { onConflict: "user_id,ticker", ignoreDuplicates: true },
        );
        writeLocal([]);
      }

      const { data, error } = await supabase
        .from("watchlist_items")
        .select("ticker, name, exchange, price_at_addition, created_at")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      
      let finalData = data;
      
      if (error && error.message.includes("price_at_addition")) {
        // Fallback for when the price_at_addition column hasn't been migrated yet
        const fallback = await supabase
          .from("watchlist_items")
          .select("ticker, name, exchange, created_at")
          .order("created_at", { ascending: false });
          
        if (fallback.error) {
           console.error("[watchlist] load failed:", fallback.error.message);
           setItems(readLocal());
           setLoading(false);
           return;
        }
        finalData = fallback.data as any;
      } else if (error) {
        console.error("[watchlist] load failed, falling back to local:", error.message);
        setItems(readLocal());
        setLoading(false);
        return;
      }
      
      setItems(
        (finalData ?? []).map((row) => ({
          ticker: row.ticker,
          name: row.name,
          exchange: row.exchange,
          // @ts-ignore - Handle both schemas
          priceAtAddition: row.price_at_addition ?? undefined,
          createdAt: row.created_at,
        })),
      );
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const has = useCallback((ticker: string) => items.some((i) => i.ticker === ticker), [items]);

  const remove = useCallback(
    async (ticker: string) => {
      // Optimistic: the UI should respond instantly to a tap.
      const next = items.filter((i) => i.ticker !== ticker);
      setItems(next);

      const supabase = getSupabaseBrowserClient();
      if (supabase && user) {
        const { error } = await supabase.from("watchlist_items").delete().eq("ticker", ticker);
        if (error) console.error("[watchlist] remove failed:", error.message);
      } else {
        writeLocal(next);
      }
    },
    [items, user],
  );

  const toggle = useCallback(
    async (item: Omit<WatchlistItem, "createdAt">) => {
      if (has(item.ticker)) {
        await remove(item.ticker);
        return;
      }

      const entry: WatchlistItem = { ...item, createdAt: new Date().toISOString() };
      const next = [entry, ...items];
      setItems(next);

      const supabase = getSupabaseBrowserClient();
      if (supabase && user) {
        let insertData: any = {
          user_id: user.id,
          ticker: item.ticker,
          name: item.name,
          exchange: item.exchange,
          price_at_addition: item.priceAtAddition ?? null,
        };
        
        let res = await supabase.from("watchlist_items").insert(insertData);
        
        // Fallback for when the price_at_addition column hasn't been migrated yet
        if (res.error && res.error.message.includes("price_at_addition")) {
            delete insertData.price_at_addition;
            res = await supabase.from("watchlist_items").insert(insertData);
        }

        if (res.error) {
          console.error("[watchlist] add failed:", res.error.message);
          setItems(items); // roll back
        }
      } else {
        writeLocal(next);
      }
    },
    [has, items, remove, user],
  );

  return (
    <WatchlistContext.Provider value={{ items, loading, has, toggle, remove, isLocal }}>
      {children}
    </WatchlistContext.Provider>
  );
}

const DEFAULT_WATCHLIST: WatchlistValue = {
  items: [],
  loading: false,
  has: () => false,
  toggle: async () => {},
  remove: async () => {},
  isLocal: true,
};

export function useWatchlist(): WatchlistValue {
  const context = useContext(WatchlistContext);
  return context ?? DEFAULT_WATCHLIST;
}
