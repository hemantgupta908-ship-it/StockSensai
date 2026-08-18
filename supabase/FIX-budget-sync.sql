-- Repairs budget sync on a project created before 2026-08-16.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- `budget_store` was created without a `revision` column, and the migration
-- that adds it was never applied. The client selects that column by name, so
-- every read failed with `42703 column budget_store.revision does not exist`,
-- and every write with it. The failure was invisible on a device that already
-- had data (the client falls back to its localStorage copy) and total on a
-- fresh one: a signed-in account rendered a net worth of zero.

alter table public.budget_store
  add column if not exists revision bigint not null default 0;

-- Confirmation. Expect one row: revision | bigint | 0
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'budget_store'
  and column_name = 'revision';
