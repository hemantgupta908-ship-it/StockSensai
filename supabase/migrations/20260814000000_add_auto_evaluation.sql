create table if not exists public.recommendation_history (
  id                   uuid primary key default gen_random_uuid(),
  stock_ticker         text not null,
  strategy_id          text not null,
  trading_style        text not null
                         check (trading_style in ('swing', 'positional', 'long-term')),
  risk_tolerance       text not null
                         check (risk_tolerance in ('conservative', 'moderate', 'aggressive')),
  buy_range_mid        numeric(18, 4) not null,
  target_price         numeric(18, 4) not null,
  stop_loss            numeric(18, 4) not null,
  estimated_hold_days  integer not null,
  status               text not null default 'pending'
                         check (status in ('pending', 'won', 'lost', 'expired')),
  generated_at         timestamptz not null default now(),
  evaluated_at         timestamptz
);

create index if not exists recommendation_history_pending_idx
  on public.recommendation_history (status) where status = 'pending';

alter table public.recommendation_history enable row level security;

drop policy if exists "recommendation_history: readable by public" on public.recommendation_history;
create policy "recommendation_history: readable by public"
  on public.recommendation_history for select
  to public
  using (true);


create table if not exists public.strategy_performance (
  strategy_id   text primary key,
  win_rate      numeric(5, 4) not null default 0,
  total_trades  integer not null default 0,
  updated_at    timestamptz not null default now()
);

alter table public.strategy_performance enable row level security;

drop policy if exists "strategy_performance: readable by public" on public.strategy_performance;
create policy "strategy_performance: readable by public"
  on public.strategy_performance for select
  to public
  using (true);
