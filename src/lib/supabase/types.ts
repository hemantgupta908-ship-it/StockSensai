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
  alert_above: number | null;
  alert_below: number | null;
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
  /**
   * Optimistic-concurrency counter. A writer updates `where revision = <the one
   * it read>`, so a device working from a stale copy matches no row and
   * reconciles instead of overwriting. See `src/lib/budget/sync.ts`.
   */
  revision: number;
  updated_at: string;
};
export type RecommendationHistoryRow = {
  id: string;
  stock_ticker: string;
  strategy_id: string;
  trading_style: string;
  risk_tolerance: string;
  buy_range_mid: number;
  target_price: number;
  stop_loss: number;
  estimated_hold_days: number;
  status: string;
  generated_at: string;
  evaluated_at: string | null;
};

export type StrategyPerformanceRow = {
  strategy_id: string;
  win_rate: number;
  total_trades: number;
  updated_at: string;
};

export type SectorMedianRow = {
  sector: string;
  pe: number;
  pb: number;
  sample_size: number;
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
        Insert: Insert<WatchlistItemRow, "id" | "created_at" | "note" | "price_at_addition" | "alert_above" | "alert_below">;
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
        Insert: Insert<BudgetStoreRow, "updated_at" | "revision">;
        Update: Partial<BudgetStoreRow>;
        Relationships: [];
      };
      recommendation_history: {
        Row: RecommendationHistoryRow;
        Insert: Insert<RecommendationHistoryRow, "id" | "status" | "generated_at" | "evaluated_at">;
        Update: Partial<RecommendationHistoryRow>;
        Relationships: [];
      };
      strategy_performance: {
        Row: StrategyPerformanceRow;
        Insert: Insert<StrategyPerformanceRow, "win_rate" | "total_trades" | "updated_at">;
        Update: Partial<StrategyPerformanceRow>;
        Relationships: [];
      };
      sector_medians: {
        Row: SectorMedianRow;
        Insert: Insert<SectorMedianRow, "sample_size" | "updated_at">;
        Update: Partial<SectorMedianRow>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
