-- Midnight Garage analytics (plan item 0.9). Privacy-clean: random device
-- ids, no PII. Insert-only from clients via the anon key; reads require the
-- service role (dashboards, v1.1 re-rating queries, 2.0 global stats).

create table if not exists public.events (
  id          bigint generated always as identity primary key,
  device_id   text not null,
  session_id  text not null,
  name        text not null,
  props       jsonb not null default '{}'::jsonb,
  client_ts   timestamptz not null,
  inserted_at timestamptz not null default now()
);

create index if not exists events_name_ts_idx on public.events (name, client_ts);
create index if not exists events_level_idx on public.events (((props->>'level')::int)) where props ? 'level';

alter table public.events enable row level security;

-- Clients may only insert.
create policy "anon insert" on public.events
  for insert to anon with check (true);
-- No select/update/delete policies for anon: reads are service-role only.

-- v1.1 tuning starter: per-level funnel (attempts, win rate, hint/undo load).
-- select props->>'level' as level,
--        count(*) filter (where name = 'level_start')  as starts,
--        count(*) filter (where name = 'level_win')    as wins,
--        avg((props->>'undos')::int)  filter (where name = 'level_win') as avg_undos,
--        avg((props->>'hints')::int)  filter (where name = 'level_win') as avg_hints,
--        avg((props->>'time_s')::int) filter (where name = 'level_win') as avg_time_s
-- from events group by 1 order by (props->>'level')::int;
