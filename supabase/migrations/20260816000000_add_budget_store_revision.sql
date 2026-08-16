-- Optimistic concurrency for the budget document.
--
-- `budget_store` holds the whole dataset as one JSON document per user. Writes
-- were unconditional upserts, so two devices editing the same account meant the
-- slower writer erased the faster one's work with no error and no trace.
--
-- `revision` makes a write state which version it believes it is replacing. The
-- client updates with `where revision = <the one it loaded>`; a stale writer
-- matches no row, learns it is behind, and merges instead of clobbering (see
-- src/lib/budget/sync.ts).

alter table public.budget_store
  add column if not exists revision bigint not null default 0;
