-- =============================================================================
-- Ekagra: Sunday weekly review (Milestone 13)
--
-- weekly_reviews: one per week (week_start = the Monday it began).
--   stats     the week's numbers (time per area against the budget, blocks done, quiz accuracy,
--             retention, focus, distractions, check-ins, tasks, hustle)
--   insights  3 short observations
--   changes   up to 3 suggested changes the app can apply in one tap, each with its status
--             (open, applied or skipped)
--   source    who wrote it: the AI (ai-review) or the rules on the device (Demo Mode, or when
--             the AI can't be reached)
--
-- Tested by tests/db/phase1-migration.test.ts and src/lib/demoDb.parity.test.ts (npm test).
-- =============================================================================

create table public.weekly_reviews (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start      date not null,
  stats           jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object'),
  insights        jsonb not null default '[]'::jsonb check (jsonb_typeof(insights) = 'array'),
  changes         jsonb not null default '[]'::jsonb check (jsonb_typeof(changes) = 'array'),
  source          text not null default 'device' check (source in ('ai', 'device')),
  model           text,
  prompt_version  text,
  completed_at    timestamptz,  -- when the student finished the review
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, week_start)
);

-- Like 001 (sections 4 and 5a): each user reads and changes only their own rows.
alter table public.weekly_reviews enable row level security;
create policy weekly_reviews_select_own on public.weekly_reviews for select to authenticated using (user_id = (select auth.uid()));
create policy weekly_reviews_insert_own on public.weekly_reviews for insert to authenticated with check (user_id = (select auth.uid()));
create policy weekly_reviews_update_own on public.weekly_reviews for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy weekly_reviews_delete_own on public.weekly_reviews for delete to authenticated using (user_id = (select auth.uid()));
create trigger set_updated_at before update on public.weekly_reviews for each row execute function public.set_updated_at();

-- (Found by user_id through the unique index.)

-- Like 001 (5d): signed-out visitors get no access.
revoke all on public.weekly_reviews from anon;


-- -----------------------------------------------------------------------------
-- Safety check (like 001, section 6): stop if any table in "public" has no RLS.
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
