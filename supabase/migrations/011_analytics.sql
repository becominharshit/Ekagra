-- =============================================================================
-- Ekagra: Privacy-respecting consent-gated product analytics (011_analytics.sql)
--
-- analytics_events  lightweight telemetry rows recorded only when the user opts
--                   in cleanly. Enforces strict RLS (auth.uid() = user_id) and
--                   cascades automatically on account deletion.
--
-- Tested by tests/db/phase1-migration.test.ts (npm test).
-- =============================================================================

create table public.analytics_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_name  text not null check (char_length(event_name) between 1 and 80),
  app_surface text not null default 'web' check (app_surface in ('web', 'studio', 'android', 'extension')),
  properties  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger analytics_events_set_updated_at
  before update on public.analytics_events
  for each row execute function public.set_updated_at();

alter table public.analytics_events enable row level security;

create policy analytics_events_select_own on public.analytics_events
  for select to authenticated using (user_id = (select auth.uid()));

create policy analytics_events_insert_own on public.analytics_events
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy analytics_events_delete_own on public.analytics_events
  for delete to authenticated using (user_id = (select auth.uid()));

create index analytics_events_user_created_idx on public.analytics_events (user_id, created_at desc);

revoke all on public.analytics_events from anon;

-- Safety check: ensure RLS is enabled on all public tables.
do $$
declare
  missing text;
begin
  select string_agg(c.relname, ', ')
    into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if missing is not null then
    raise exception 'RLS is not enabled on: %', missing;
  end if;
end;
$$;
