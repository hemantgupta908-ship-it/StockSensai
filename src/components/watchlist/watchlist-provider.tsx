"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSession } from "@/components/auth/session-provider";
import { backendFor } from "@/lib/store/backend";
import { readCollection, writeCollection } from "@/lib/store/collection-remote";
import { DOCS } from "@/lib/drive/app-data";

export interface WatchlistItem {
  ticker: string;
  name: string;
  exchange: string;
  priceAtAddition?: number;
  alertAbove?: number | null;
  alertBelow?: number | null;
  createdAt: string;
}

interface WatchlistValue {
  items: WatchlistItem[];
  loading: boolean;
  has: (ticker: string) => boolean;
  toggle: (item: Omit<WatchlistItem, "createdAt">) => Promise<void>;
  updateAlerts: (ticker: string, alerts: { alertAbove?: number | null; alertBelow?: number | null }) => Promise<void>;
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
 * Watchlist backed by whichever store the account uses — the user's own Google
 * Drive, this project's Supabase tables, or browser storage.
 *
 * The local fallback is what makes the app demoable with no backend at all. On
 * first sign-in, anything saved locally is migrated up to the account rather
 * than being silently discarded.
 */
export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const { user, authEnabled } = useSession();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const backend = backendFor(user, authEnabled);
  const isLocal = backend === "local";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const supabase = getSupabaseBrowserClient();

      if (backend === "local") {
        if (!cancelled) {
          setItems(readLocal());
          setLoading(false);
        }
        return;
      }

      if (backend === "drive") {
        const remote = await readCollection<WatchlistItem>(DOCS.watchlist);
        if (cancelled) return;

        if (remote === null) {
          // Drive unreachable — show the cached copy rather than an empty list.
          setItems(readLocal());
          setLoading(false);
          return;
        }

        if (remote === "empty") {
          // First sync for this account. Anything already in this browser is
          // what they built before signing in, so it becomes the initial
          // contents rather than being discarded.
          const local = readLocal();
          setItems(local);
          if (local.length > 0) await writeCollection(DOCS.watchlist, local);
          setLoading(false);
          return;
        }

        setItems(remote);
        // Keep the browser mirror current so the list still renders on a later
        // load that cannot reach Drive.
        writeLocal(remote);
        setLoading(false);
        return;
      }

      if (!supabase || !user) {
        if (!cancelled) {
          setItems(readLocal());
          setLoading(false);
        }
        return;
      }

      /*
       * Migrate any locally saved rows into the account on first load.
       *
       * The local copy is only cleared once the upload has actually succeeded.
       * Previously `writeLocal([])` ran unconditionally straight after the
       * upsert, so any failure — offline, RLS, or the `price_at_addition`
       * column not yet migrated — destroyed the user's watchlist without it
       * ever reaching the server. Note the two paths below already handle that
       * missing column; the migrate step was the one that didn't.
       */
      const local = readLocal();
      if (local.length > 0) {
        const rows = local.map((item) => ({
          user_id: user.id,
          ticker: item.ticker,
          name: item.name,
          exchange: item.exchange,
          price_at_addition: item.priceAtAddition ?? null,
        }));
        const options = { onConflict: "user_id,ticker", ignoreDuplicates: true } as const;

        let { error: migrateError } = await supabase
          .from("watchlist_items")
          .upsert(rows, options);

        if (migrateError?.message.includes("price_at_addition")) {
          const withoutPrice = rows.map(({ price_at_addition: _omit, ...rest }) => rest);
          ({ error: migrateError } = await supabase
            .from("watchlist_items")
            .upsert(withoutPrice, options));
        }

        if (migrateError) {
          // Keep the local copy and try again next load. Better a duplicate
          // upsert later — it is idempotent on (user_id, ticker) — than a
          // watchlist that quietly disappears.
          console.error("[watchlist] migration failed, keeping local copy:", migrateError.message);
        } else {
          writeLocal([]);
        }
      }

      const { data, error } = await supabase
        .from("watchlist_items")
        .select("ticker, name, exchange, price_at_addition, alert_above, alert_below, created_at")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      
      let finalData = data;
      
      if (error && error.message.includes("alert_above")) {
        // Fallback for when alert_above/alert_below columns haven't been migrated yet
        const fallback = await supabase
          .from("watchlist_items")
          .select("ticker, name, exchange, price_at_addition, created_at")
          .order("created_at", { ascending: false });
          
        if (fallback.error && fallback.error.message.includes("price_at_addition")) {
          // Double fallback if price_at_addition is also missing
          const deepFallback = await supabase
            .from("watchlist_items")
            .select("ticker, name, exchange, created_at")
            .order("created_at", { ascending: false });
            
          if (deepFallback.error) {
             console.error("[watchlist] load failed (deep fallback):", deepFallback.error.message);
             setItems(readLocal());
             setLoading(false);
             return;
          }
          finalData = deepFallback.data as any;
        } else if (fallback.error) {
           console.error("[watchlist] load failed (fallback):", fallback.error.message);
           setItems(readLocal());
           setLoading(false);
           return;
        } else {
          finalData = fallback.data as any;
        }
      } else if (error && error.message.includes("price_at_addition")) {
        // Fallback for when only price_at_addition is missing
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
          priceAtAddition: row.price_at_addition ?? undefined,
          alertAbove: row.alert_above ?? undefined,
          alertBelow: row.alert_below ?? undefined,
          createdAt: row.created_at,
        })),
      );
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, backend]);

  const has = useCallback((ticker: string) => items.some((i) => i.ticker === ticker), [items]);

  const remove = useCallback(
    async (ticker: string) => {
      // Optimistic: the UI should respond instantly to a tap.
      const next = items.filter((i) => i.ticker !== ticker);
      setItems(next);

      if (backend === "drive") {
        writeLocal(next);
        if (!(await writeCollection(DOCS.watchlist, next))) {
          console.error("[watchlist] remove failed to reach Drive");
          setItems(items);
          writeLocal(items);
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (backend === "supabase" && supabase && user) {
        const { error } = await supabase.from("watchlist_items").delete().eq("ticker", ticker);
        if (error) console.error("[watchlist] remove failed:", error.message);
      } else {
        writeLocal(next);
      }
    },
    [items, user, backend],
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

      if (backend === "drive") {
        writeLocal(next);
        if (!(await writeCollection(DOCS.watchlist, next))) {
          console.error("[watchlist] add failed to reach Drive");
          setItems(items);
          writeLocal(items);
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (backend === "supabase" && supabase && user) {
        const insertData: any = {
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
    [has, items, remove, user, backend],
  );

  const updateAlerts = useCallback(
    async (ticker: string, alerts: { alertAbove?: number | null; alertBelow?: number | null }) => {
      // Optimistic update
      const next = items.map((i) =>
        i.ticker === ticker
          ? { ...i, alertAbove: alerts.alertAbove, alertBelow: alerts.alertBelow }
          : i
      );
      setItems(next);

      if (backend === "drive") {
        writeLocal(next);
        if (!(await writeCollection(DOCS.watchlist, next))) {
          console.error("[watchlist] updateAlerts failed to reach Drive");
          setItems(items);
          writeLocal(items);
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (backend === "supabase" && supabase && user) {
        const updateData: any = {};
        if (alerts.alertAbove !== undefined) updateData.alert_above = alerts.alertAbove;
        if (alerts.alertBelow !== undefined) updateData.alert_below = alerts.alertBelow;

        if (Object.keys(updateData).length > 0) {
          const { error } = await supabase
            .from("watchlist_items")
            .update(updateData)
            .eq("ticker", ticker);
            
          if (error) {
            console.error("[watchlist] updateAlerts failed:", error.message);
            setItems(items); // rollback on error
          }
        }
      } else {
        writeLocal(next);
      }
    },
    [items, user, backend]
  );

  return (
    <WatchlistContext.Provider value={{ items, loading, has, toggle, updateAlerts, remove, isLocal }}>
      {children}
    </WatchlistContext.Provider>
  );
}

const DEFAULT_WATCHLIST: WatchlistValue = {
  items: [],
  loading: false,
  has: () => false,
  toggle: async () => {},
  updateAlerts: async () => {},
  remove: async () => {},
  isLocal: true,
};

export function useWatchlist(): WatchlistValue {
  const context = useContext(WatchlistContext);
  return context ?? DEFAULT_WATCHLIST;
}
