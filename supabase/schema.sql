-- ---------------------------------------------------------------------------
-- WealthSensei schema
--
-- Run in the Supabase SQL editor (or `supabase db push`) after creating a
-- project. Users are handled entirely by Supabase Auth (auth.users); every
-- table below is keyed to that and protected by row-level security so a user
-- can only ever reach their own rows.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------- watchlist ---

create table if not exists public.watchlist_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  ticker      text not null,
  name        text not null,
  exchange    text not null check (exchange in ('NSE', 'BSE')),
  note               text,
  price_at_addition  numeric(18, 4),
  created_at         timestamptz not null default now(),

  -- One row per stock per user; the client relies on this for upsert-on-migrate.
  constraint watchlist_items_user_ticker_key unique (user_id, ticker)
);

create index if not exists watchlist_items_user_created_idx
  on public.watchlist_items (user_id, created_at desc);

alter table public.watchlist_items enable row level security;

drop policy if exists "watchlist: owner can read" on public.watchlist_items;
create policy "watchlist: owner can read"
  on public.watchlist_items for select
  using (auth.uid() = user_id);

drop policy if exists "watchlist: owner can insert" on public.watchlist_items;
create policy "watchlist: owner can insert"
  on public.watchlist_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "watchlist: owner can update" on public.watchlist_items;
create policy "watchlist: owner can update"
  on public.watchlist_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "watchlist: owner can delete" on public.watchlist_items;
create policy "watchlist: owner can delete"
  on public.watchlist_items for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------ portfolio journal ---

create table if not exists public.portfolio_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  ticker       text not null,
  name         text not null,
  exchange     text not null check (exchange in ('NSE', 'BSE')),
  quantity     numeric(18, 4) not null check (quantity > 0),
  entry_price  numeric(18, 4) not null check (entry_price > 0),
  entry_date   date not null,

  -- Which screen surfaced the idea, if it came from a recommendation card.
  strategy_id    text,
  -- Must stay in step with `TRADING_STYLES` in src/lib/strategies/types.ts.
  trading_style  text check (trading_style in
                   ('intraday', 'short-term', 'swing', 'positional', 'long-term')),

  -- Snapshot of the plan at the moment the position was logged. Kept so the
  -- journal can compare intent against execution later, even after the live
  -- recommendation has changed or disappeared entirely.
  recommended_buy_low    numeric(18, 4),
  recommended_buy_high   numeric(18, 4),
  recommended_sell_low   numeric(18, 4),
  recommended_sell_high  numeric(18, 4),
  recommended_stop_loss  numeric(18, 4),

  exit_price  numeric(18, 4) check (exit_price is null or exit_price > 0),
  exit_date   date,
  note        text,
  created_at  timestamptz not null default now(),

  -- A position is either open (neither set) or closed (both set).
  constraint portfolio_entries_exit_consistency
    check ((exit_price is null) = (exit_date is null)),
  constraint portfolio_entries_exit_after_entry
    check (exit_date is null or exit_date >= entry_date)
);

create index if not exists portfolio_entries_user_date_idx
  on public.portfolio_entries (user_id, entry_date desc);

alter table public.portfolio_entries enable row level security;

drop policy if exists "portfolio: owner can read" on public.portfolio_entries;
create policy "portfolio: owner can read"
  on public.portfolio_entries for select
  using (auth.uid() = user_id);

drop policy if exists "portfolio: owner can insert" on public.portfolio_entries;
create policy "portfolio: owner can insert"
  on public.portfolio_entries for insert
  with check (auth.uid() = user_id);

drop policy if exists "portfolio: owner can update" on public.portfolio_entries;
create policy "portfolio: owner can update"
  on public.portfolio_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "portfolio: owner can delete" on public.portfolio_entries;
create policy "portfolio: owner can delete"
  on public.portfolio_entries for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------ user preferences ---

create table if not exists public.user_preferences (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  risk_tolerance         text not null default 'moderate'
                           check (risk_tolerance in ('conservative', 'moderate', 'aggressive')),
  theme                  text not null default 'system'
                           check (theme in ('light', 'dark', 'system')),
  default_trading_style  text not null default 'swing'
                           check (default_trading_style in
                             ('intraday', 'short-term', 'swing', 'positional', 'long-term')),
  updated_at             timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "preferences: owner can read" on public.user_preferences;
create policy "preferences: owner can read"
  on public.user_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "preferences: owner can upsert" on public.user_preferences;
create policy "preferences: owner can upsert"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists "preferences: owner can update" on public.user_preferences;
create policy "preferences: owner can update"
  on public.user_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Seed a preferences row whenever a new account is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------- cached recommendations ---------

-- Populated by the daily cron (`/api/cron/recompute`) using the service-role
-- key, so recommendations don't have to be recomputed on every page load.
create table if not exists public.cached_recommendations (
  id                   uuid primary key default gen_random_uuid(),
  stock_ticker         text not null,
  strategy_id          text not null,
  trading_style        text not null
                         check (trading_style in
                           ('intraday', 'short-term', 'swing', 'positional', 'long-term')),
  risk_tolerance       text not null
                         check (risk_tolerance in ('conservative', 'moderate', 'aggressive')),
  buy_range_low        numeric(18, 4) not null,
  buy_range_high       numeric(18, 4) not null,
  sell_range_low       numeric(18, 4) not null,
  sell_range_high      numeric(18, 4) not null,
  stop_loss            numeric(18, 4) not null,
  estimated_hold_days  integer not null,
  confidence_score     integer not null check (confidence_score between 0 and 100),
  risk_level           text not null check (risk_level in ('Low', 'Medium', 'High')),
  direction            text not null check (direction in ('bullish', 'bearish')),
  reason               text not null,

  -- Full Recommendation object so the UI can render straight from cache.
  payload              jsonb not null,
  generated_at         timestamptz not null default now(),

  constraint cached_recommendations_unique
    unique (stock_ticker, strategy_id, risk_tolerance),
  constraint cached_recommendations_buy_range check (buy_range_low <= buy_range_high),
  constraint cached_recommendations_sell_range check (sell_range_low <= sell_range_high)
);

create index if not exists cached_recommendations_lookup_idx
  on public.cached_recommendations (trading_style, risk_tolerance, confidence_score desc);

alter table public.cached_recommendations enable row level security;

-- Recommendations are not user data: any user (signed in or guest) reads the same rows.
-- Writes are restricted to the service-role key, which bypasses RLS entirely,
-- so there is deliberately no insert/update policy here.
drop policy if exists "recommendations: readable by authenticated" on public.cached_recommendations;
drop policy if exists "recommendations: readable by public" on public.cached_recommendations;
create policy "recommendations: readable by public"
  on public.cached_recommendations for select
  to public
  using (true);


-- ---------------------------------------------------------------------------
-- Budget environment
-- ---------------------------------------------------------------------------
-- The budget side of the app keeps its own store, entirely separate from the
-- stock tables above. It is local-first: this table is a mirror for users who
-- are signed in, not the source of truth, so the whole dataset is held as one
-- JSON document per user rather than normalised. The ported Cashew schema is
-- nine interlinked tables with its own delete-log consistency model; syncing it
-- relationally would mean reimplementing that model server-side for no gain
-- while the client remains authoritative.

create table if not exists public.budget_store (
  user_id    uuid primary key references auth.users (id) on delete cascade,

  -- Serialised BudgetDatabase (see src/lib/budget/types.ts).
  payload    jsonb not null default '{}'::jsonb,
  -- Serialised BudgetSettings (see src/lib/budget/defaults.ts).
  settings   jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now()
);

alter table public.budget_store enable row level security;

drop policy if exists "budget_store: owner full access" on public.budget_store;
create policy "budget_store: owner full access"
  on public.budget_store for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
