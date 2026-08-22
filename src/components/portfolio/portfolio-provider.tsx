"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSession } from "@/components/auth/session-provider";
import { backendFor } from "@/lib/store/backend";
import { readCollection, writeCollection } from "@/lib/store/collection-remote";
import { DOCS } from "@/lib/drive/app-data";

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
  /**
   * Exit `quantity` shares of a position, which may be fewer than it holds.
   *
   * Selling the lot in full is `close` by another name. Selling part of it
   * splits the row: the quantity sold becomes its own closed entry and the
   * remainder stays open. Splitting rather than adding an `exitQuantity`
   * column keeps every existing calculation correct without touching them —
   * realised P&L, open value, the CSV export and the analytics all read
   * `(exitPrice - entryPrice) * quantity` over the same flat list, and a lot
   * that was exited in three tranches is simply three rows.
   */
  sell: (
    id: string,
    quantity: number,
    exitPrice: number,
    exitDate: string,
  ) => Promise<void>;
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
 * Split an open lot into an exited tranche and the remainder still held.
 *
 * Pure, and shared by the browser-storage and Drive paths so the two cannot
 * drift. The invariant that matters: the quantity across the resulting rows
 * equals the quantity before, so no shares are created or destroyed by an exit.
 *
 * Returns `null` when the split is not a partial one — an unknown id, a
 * non-positive quantity, or a quantity covering the whole lot, the last of
 * which is an ordinary close and is handled as one.
 */
export function splitLot(
  entries: PortfolioEntry[],
  id: string,
  quantity: number,
  exitPrice: number,
  exitDate: string,
  newId: () => string,
): PortfolioEntry[] | null {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  if (!(quantity > 0) || quantity >= entry.quantity) return null;

  const closedLot: PortfolioEntry = {
    ...entry,
    id: newId(),
    quantity,
    exitPrice,
    exitDate,
  };

  return [
    closedLot,
    ...entries.map((e) =>
      e.id === id ? { ...e, quantity: e.quantity - quantity } : e,
    ),
  ];
}

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

  const backend = backendFor(user, authEnabled);
  const isLocal = backend === "local";

  /**
   * The current entries, readable from a callback without being a dependency.
   *
   * The Drive paths below need the whole collection to rewrite the document,
   * and reading it from the closure would capture a stale array whenever two
   * edits land in the same tick. The Supabase paths do not have this problem —
   * they send a single row — which is why they keep their existing shape.
   */
  const entriesRef = useRef<PortfolioEntry[]>([]);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  /** Write the whole journal to Drive, rolling the UI back if it does not land. */
  const persistDrive = useCallback(async (next: PortfolioEntry[]): Promise<void> => {
    const previous = entriesRef.current;
    setEntries(next);
    writeLocal(next);
    if (!(await writeCollection(DOCS.portfolio, next))) {
      console.error("[portfolio] write failed to reach Drive");
      setEntries(previous);
      writeLocal(previous);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const supabase = getSupabaseBrowserClient();

      if (backend === "local") {
        if (!cancelled) {
          setEntries(readLocal());
          setLoading(false);
        }
        return;
      }

      if (backend === "drive") {
        const remote = await readCollection<PortfolioEntry>(DOCS.portfolio);
        if (cancelled) return;

        if (remote === null) {
          // Drive unreachable: the cached copy is better than an empty journal.
          setEntries(readLocal());
        } else if (remote === "empty") {
          // First sync for this account — whatever is in this browser becomes
          // the journal's starting contents rather than being dropped.
          const local = readLocal();
          setEntries(local);
          if (local.length > 0) await writeCollection(DOCS.portfolio, local);
        } else {
          setEntries(remote);
          writeLocal(remote);
        }
        setLoading(false);
        return;
      }

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
  }, [user, backend]);

  const add = useCallback(
    async (entry: NewPortfolioEntry) => {
      if (backend === "drive") {
        const created: PortfolioEntry = { ...entry, id: crypto.randomUUID() };
        await persistDrive([created, ...entriesRef.current]);
        return;
      }

      const supabase = getSupabaseBrowserClient();

      if (backend === "supabase" && supabase && user) {
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
    [user, backend, persistDrive],
  );

  const update = useCallback(
    async (id: string, updates: Partial<PortfolioEntry>) => {
      if (backend === "drive") {
        await persistDrive(
          entriesRef.current.map((e) => (e.id === id ? { ...e, ...updates } : e)),
        );
        return;
      }

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
    [user, backend, persistDrive],
  );

  const close = useCallback(
    async (id: string, exitPrice: number, exitDate: string) => {
      if (backend === "drive") {
        await persistDrive(
          entriesRef.current.map((e) => (e.id === id ? { ...e, exitPrice, exitDate } : e)),
        );
        return;
      }

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
    [user, backend, persistDrive],
  );

  const sell = useCallback(
    async (id: string, quantity: number, exitPrice: number, exitDate: string) => {
      const entry = entriesRef.current.find((e) => e.id === id);
      if (!entry) return;

      // Guard the boundary in the store as well as the form: a rounding error
      // on the way in must not leave a position holding 0.0001 shares forever.
      const sold = Math.min(quantity, entry.quantity);
      if (!(sold > 0)) return;

      const remaining = entry.quantity - sold;

      if (remaining <= 0) {
        await close(id, exitPrice, exitDate);
        return;
      }

      if (backend === "drive") {
        const next = splitLot(
          entriesRef.current,
          id,
          sold,
          exitPrice,
          exitDate,
          () => crypto.randomUUID(),
        );
        if (next) await persistDrive(next);
        return;
      }

      const supabase = getSupabaseBrowserClient();

      if (backend === "supabase" && supabase && user) {
        // Insert the closed tranche before shrinking the open one. Neither
        // order is atomic, but this one fails safe: an insert that lands
        // without the follow-up update over-reports the holding, which is
        // visible and correctable, whereas the reverse silently destroys
        // shares the user still owns.
        const { data, error: insertError } = await supabase
          .from("portfolio_entries")
          .insert({
            user_id: user.id,
            ticker: entry.ticker,
            name: entry.name,
            exchange: entry.exchange,
            quantity: sold,
            entry_price: entry.entryPrice,
            entry_date: entry.entryDate,
            strategy_id: entry.strategyId,
            trading_style: entry.tradingStyle,
            recommended_buy_low: entry.recommendedBuyLow,
            recommended_buy_high: entry.recommendedBuyHigh,
            recommended_sell_low: entry.recommendedSellLow,
            recommended_sell_high: entry.recommendedSellHigh,
            recommended_stop_loss: entry.recommendedStopLoss,
            exit_price: exitPrice,
            exit_date: exitDate,
            note: entry.note,
          })
          .select()
          .single();

        if (insertError) {
          console.error("[portfolio] partial sell failed:", insertError.message);
          return;
        }

        const { error: updateError } = await supabase
          .from("portfolio_entries")
          .update({ quantity: remaining })
          .eq("id", id);

        if (updateError) {
          console.error(
            "[portfolio] partial sell could not reduce the open lot, rolling back:",
            updateError.message,
          );
          await supabase.from("portfolio_entries").delete().eq("id", data.id);
          return;
        }

        setEntries((current) => [
          fromRow(data),
          ...current.map((e) => (e.id === id ? { ...e, quantity: remaining } : e)),
        ]);
        return;
      }

      setEntries((current) => {
        const next =
          splitLot(current, id, sold, exitPrice, exitDate, () => crypto.randomUUID()) ??
          current;
        writeLocal(next);
        return next;
      });
    },
    [user, backend, persistDrive, close],
  );

  const remove = useCallback(
    async (id: string) => {
      if (backend === "drive") {
        await persistDrive(entriesRef.current.filter((e) => e.id !== id));
        return;
      }

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
    [user, backend, persistDrive],
  );

  return (
    <PortfolioContext.Provider
      value={{ entries, loading, add, update, close, sell, remove, isLocal }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

const DEFAULT_PORTFOLIO: PortfolioValue = {
  entries: [],
  loading: false,
  add: async () => {},
  update: async () => {},
  close: async () => {},
  sell: async () => {},
  remove: async () => {},
  isLocal: true,
};

export function usePortfolio(): PortfolioValue {
  const context = useContext(PortfolioContext);
  return context ?? DEFAULT_PORTFOLIO;
}
