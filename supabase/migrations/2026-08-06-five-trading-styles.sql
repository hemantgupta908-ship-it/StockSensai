-- ---------------------------------------------------------------------------
-- Widen the trading-style CHECK constraints from three styles to five.
--
-- `schema.sql` uses `create table if not exists`, so re-running it against an
-- existing project leaves the old constraints in place. Run this once instead.
--
-- Why it matters: the engine gained `intraday` and `positional`, and the daily
-- cron writes `trading_style` straight into `cached_recommendations`. Against
-- the old three-value constraint every intraday and positional row is rejected,
-- so those two styles quietly cache nothing.
-- ---------------------------------------------------------------------------

alter table public.portfolio_entries
  drop constraint if exists portfolio_entries_trading_style_check;
alter table public.portfolio_entries
  add constraint portfolio_entries_trading_style_check
  check (trading_style is null or trading_style in
    ('intraday', 'short-term', 'swing', 'positional', 'long-term'));

alter table public.user_preferences
  drop constraint if exists user_preferences_default_trading_style_check;
alter table public.user_preferences
  add constraint user_preferences_default_trading_style_check
  check (default_trading_style in
    ('intraday', 'short-term', 'swing', 'positional', 'long-term'));

alter table public.cached_recommendations
  drop constraint if exists cached_recommendations_trading_style_check;
alter table public.cached_recommendations
  add constraint cached_recommendations_trading_style_check
  check (trading_style in
    ('intraday', 'short-term', 'swing', 'positional', 'long-term'));
