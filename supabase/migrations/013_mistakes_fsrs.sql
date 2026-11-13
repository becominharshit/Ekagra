-- =============================================================================
-- Ekagra: Unify Mistake Notebook spaced repetition on FSRS (013_mistakes_fsrs.sql)
--
-- Adds `fsrs` JSONB card state to `public.mistakes` matching `public.flashcards`
-- so mistakes use ts-fsrs adaptive intervals (stability, difficulty, lapses)
-- while keeping status/correct_count/next_review_at indexed and compatible.
-- =============================================================================

alter table public.mistakes
  add column if not exists fsrs jsonb not null default '{}'::jsonb;

alter table public.mistakes
  drop constraint if exists mistakes_fsrs_object_check,
  add constraint mistakes_fsrs_object_check check (jsonb_typeof(fsrs) = 'object');

create index if not exists mistakes_open_due_idx
  on public.mistakes (user_id, next_review_at)
  where status = 'open';

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
