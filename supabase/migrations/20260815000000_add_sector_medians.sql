-- Persisted sector medians.
--
-- Comparing a stock's P/E and P/B against its actual peer group is the premise
-- of the value screen, so the medians should come from the same live data as
-- the ratios rather than a hardcoded table. Computing them costs one summary
-- request per instrument across the whole universe, which is only affordable
-- while a full screen is running anyway.
--
-- Storing the result lets a single stock detail page read real medians without
-- triggering that fan-out. Before this table existed, the page either paid for
-- the whole universe — measured at 68 seconds — or silently fell back to the
-- static table.

create table if not exists public.sector_medians (
  sector       text primary key,
  pe           numeric(10, 2) not null,
  pb           numeric(10, 2) not null,
  -- Peers behind the median. Below three the figure says nothing, so the
  -- writer skips the sector entirely and readers fall back to the table.
  sample_size  integer not null default 0,
  updated_at   timestamptz not null default now()
);

alter table public.sector_medians enable row level security;

-- Read-only to clients, exactly like cached_recommendations: the figures are
-- market aggregates, not user data, and only the cron writes them via the
-- service-role key. There is deliberately no insert or update policy.
drop policy if exists "sector_medians: readable by public" on public.sector_medians;
create policy "sector_medians: readable by public"
  on public.sector_medians for select
  to public
  using (true);
