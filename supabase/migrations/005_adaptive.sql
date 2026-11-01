-- =============================================================================
-- Ekagra: Adaptive practice, learning metrics and mock tests (Milestone 11)
--
-- 1. subject_ratings: the student's Elo rating per subject (starts at 1000). Questions keep their
--    own rating in questions.rating (001). Practice picks the questions the student gets right
--    about 70% of the time (docs/2-technical-design.md §9).
-- 2. topics.learned_at: when a topic was first learned (a check quiz of 80% or more), for the
--    "learning speed" metric (estimated ÷ actual minutes to learn it).
-- 3. metric_snapshots: the 4 learning metrics of a week (memory, learning speed, processing speed,
--    problem solving); null when the week had too little practice to say.
-- 4. challenges: the weekly challenge on one metric.
-- Mock tests need nothing new: quizzes.kind = 'mock' (001), one attempt per question.
--
-- Tested by tests/db/phase1-migration.test.ts and src/lib/demoDb.parity.test.ts (npm test).
-- =============================================================================

create table public.subject_ratings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id      uuid not null,
  rating          numeric(6, 1) not null default 1000 check (rating between 100 and 3000),
  attempts_count  integer not null default 0 check (attempts_count >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, subject_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade
);

alter table public.topics add column learned_at timestamptz;

create table public.metric_snapshots (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start        date not null,  -- the Monday the week began
  memory            numeric(5, 4) check (memory between 0 and 1),            -- share remembered
  learning_speed    numeric(6, 3) check (learning_speed > 0),                -- estimated ÷ actual minutes
  processing_speed  numeric(7, 1) check (processing_speed > 0),              -- median seconds per right answer
  problem_solving   numeric(5, 4) check (problem_solving between 0 and 1),   -- first-try share on hard questions
  focus_minutes     integer not null default 0 check (focus_minutes >= 0),
  details           jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, week_start)
);

create table public.challenges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start  date not null,
  metric      text not null check (metric in ('memory', 'learning_speed', 'processing_speed', 'problem_solving')),
  baseline    numeric(8, 3),
  target      numeric(8, 3) not null,
  achieved    boolean,  -- null until the week is over
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, week_start)
);

-- Like 001 (sections 4 and 5a): each user reads and changes only their own rows.
do $$
declare
  t text;
begin
  foreach t in array array['subject_ratings', 'metric_snapshots', 'challenges']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- (Each table is found by user_id through its unique index.)
create index subject_ratings_subject_idx on public.subject_ratings (subject_id);

-- Like 001 (5d): signed-out visitors get no access.
revoke all on public.subject_ratings, public.metric_snapshots, public.challenges from anon;


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
