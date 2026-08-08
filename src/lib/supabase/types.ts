/**
 * Database schema types.
 *
 * Hand-written to mirror `supabase/schema.sql`. The shape here is not
 * arbitrary — supabase-js only produces typed results when the schema
 * satisfies its `GenericSchema` constraint, which means:
 *
 *   - rows must be `type` aliases, not `interface`s (interfaces don't get the
 *     implicit index signature `Record<string, unknown>` requires);
 *   - every table needs a `Relationships` array, even when empty;
 *   - `__InternalSupabase` must declare the PostgREST version.
 *
 * Miss any of those and `.from(...)` silently degrades to `never` rather than
 * failing loudly. Regenerate with
 * `npx supabase gen types typescript --project-id <id>` once a real project
 * exists, and keep this file in step with the SQL.
 */

export type WatchlistItemRow = {
  id: string;
  user_id: string;
  ticker: string;
  name: string;
  exchange: string;
  note: string | null;
  price_at_addition: number | null;
  created_at: string;
};

export type PortfolioEntryRow = {
  id: string;
  user_id: string;
  ticker: string;
  name: string;
  exchange: string;
  quantity: number;
  entry_price: number;
  entry_date: string;
  /** Strategy that originally surfaced the idea, if it came from a card. */
  strategy_id: string | null;
  trading_style: string | null;
  /** Snapshot of the recommendation at the moment it was logged. */
  recommended_buy_low: number | null;
  recommended_buy_high: number | null;
  recommended_sell_low: number | null;
  recommended_sell_high: number | null;
  recommended_stop_loss: number | null;
  exit_price: number | null;
  exit_date: string | null;
  note: string | null;
  created_at: string;
};

export type UserPreferencesRow = {
  user_id: string;
  risk_tolerance: string;
  theme: string;
  default_trading_style: string;
  updated_at: string;
};

export type CachedRecommendationRow = {
  id: string;
  stock_ticker: string;
  strategy_id: string;
  trading_style: string;
  risk_tolerance: string;
  buy_range_low: number;
  buy_range_high: number;
  sell_range_low: number;
  sell_range_high: number;
  stop_loss: number;
  estimated_hold_days: number;
  confidence_score: number;
  risk_level: string;
  direction: string;
  reason: string;
  /** Full Recommendation object, so the UI renders without recomputation. */
  payload: unknown;
  generated_at: string;
};

/**
 * The budget environment's remote mirror.
 *
 * Stored as one JSON document per user rather than as normalised tables: the
 * ported Cashew schema is nine interlinked tables with its own delete-log
 * consistency model, and the source of truth is the local store. A document
 * keeps the two in sync in one round trip and lets the local side stay
 * authoritative, which is what the app's offline-first constraint requires.
 */
export type BudgetStoreRow = {
  user_id: string;
  /** A serialised `BudgetDatabase` from `src/lib/budget/types.ts`. */
  payload: unknown;
  /** A serialised `BudgetSettings` from `src/lib/budget/defaults.ts`. */
  settings: unknown;
  updated_at: string;
};

type Insert<T, Optional extends keyof T> = Omit<T, Optional> & Partial<Pick<T, Optional>>;

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      watchlist_items: {
        Row: WatchlistItemRow;
        Insert: Insert<WatchlistItemRow, "id" | "created_at" | "note" | "price_at_addition">;
        Update: Partial<WatchlistItemRow>;
        Relationships: [];
      };
      portfolio_entries: {
        Row: PortfolioEntryRow;
        Insert: Insert<
          PortfolioEntryRow,
          | "id"
          | "created_at"
          | "strategy_id"
          | "trading_style"
          | "recommended_buy_low"
          | "recommended_buy_high"
          | "recommended_sell_low"
          | "recommended_sell_high"
          | "recommended_stop_loss"
          | "exit_price"
          | "exit_date"
          | "note"
        >;
        Update: Partial<PortfolioEntryRow>;
        Relationships: [];
      };
      user_preferences: {
        Row: UserPreferencesRow;
        Insert: Insert<UserPreferencesRow, "updated_at">;
        Update: Partial<UserPreferencesRow>;
        Relationships: [];
      };
      cached_recommendations: {
        Row: CachedRecommendationRow;
        Insert: Insert<CachedRecommendationRow, "id">;
        Update: Partial<CachedRecommendationRow>;
        Relationships: [];
      };
      budget_store: {
        Row: BudgetStoreRow;
        Insert: Insert<BudgetStoreRow, "updated_at">;
        Update: Partial<BudgetStoreRow>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
