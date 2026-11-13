-- =============================================================================
-- Ekagra: Indexed AI usage RPC summary (015_usage_rpc_and_cache.sql)
--
-- Replaces client/edge raw row pagination over ai_usage with a single indexed
-- Postgres SUM()/COUNT() RPC (get_user_ai_usage_summary), restricted strictly
-- to service_role (Edge Functions).
--
-- Tested by tests/db/phase1-migration.test.ts (npm test).
-- =============================================================================

create index if not exists ai_usage_created_at_idx
  on public.ai_usage (created_at desc);

create or replace function public.get_user_ai_usage_summary(
  p_user_id uuid default null,
  p_day_since timestamptz default (now() - interval '24 hours'),
  p_user_month_since timestamptz default date_trunc('month', now() at time zone 'utc') at time zone 'utc',
  p_app_month_since timestamptz default date_trunc('month', now() at time zone 'utc') at time zone 'utc'
)
returns table (
  requests_last_24h bigint,
  tokens_this_month bigint,
  spent_last_24h_usd numeric,
  spent_this_month_usd numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when p_user_id is null then 0::bigint
      else (
        select count(*)::bigint
        from public.ai_usage
        where user_id = p_user_id
          and created_at >= p_day_since
      )
    end as requests_last_24h,
    case
      when p_user_id is null then 0::bigint
      else (
        select coalesce(sum(coalesce(input_tokens, 0)::bigint + coalesce(output_tokens, 0)::bigint), 0)::bigint
        from public.ai_usage
        where user_id = p_user_id
          and created_at >= p_user_month_since
      )
    end as tokens_this_month,
    (
      select coalesce(sum(cost_usd), 0)::numeric
      from public.ai_usage
      where created_at >= p_day_since
    ) as spent_last_24h_usd,
    (
      select coalesce(sum(cost_usd), 0)::numeric
      from public.ai_usage
      where created_at >= p_app_month_since
    ) as spent_this_month_usd;
$$;

revoke all on function public.get_user_ai_usage_summary(uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_user_ai_usage_summary(uuid, timestamptz, timestamptz, timestamptz) to service_role;

-- Allow authenticated users to initialize their own profile row if a callback runs
-- without an existing profile record (strictly restricted to id = auth.uid()).
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Shared YouTube lecture cache: avoids re-running Gemini on identical public
-- lectures / prompt versions / output kinds. service_role only (zero direct
-- user access).
-- -----------------------------------------------------------------------------

create table if not exists public.youtube_note_cache (
  id              uuid primary key default gen_random_uuid(),
  video_id        text not null,
  kind            text not null check (kind in ('notes', 'mind_map', 'revision_sheet', 'quiz')),
  prompt_version  text not null,
  title           text not null,
  content         text not null,
  model           text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (video_id, kind, prompt_version)
);

create index if not exists youtube_note_cache_lookup_idx
  on public.youtube_note_cache (video_id, kind, prompt_version);

alter table public.youtube_note_cache enable row level security;

drop policy if exists youtube_note_cache_deny_authenticated on public.youtube_note_cache;
create policy youtube_note_cache_deny_authenticated on public.youtube_note_cache
  for all to authenticated using (false) with check (false);

revoke all on public.youtube_note_cache from anon, authenticated;

drop trigger if exists set_updated_at on public.youtube_note_cache;
create trigger set_updated_at
  before update on public.youtube_note_cache
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Safety check: stop the migration if any table in "public" has no RLS.
-- -----------------------------------------------------------------------------

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
