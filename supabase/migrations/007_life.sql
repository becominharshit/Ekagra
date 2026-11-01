-- =============================================================================
-- Ekagra: Full Life (Milestone 14)
--
-- habits / habit_logs   daily habits (done or a count, e.g. 8 glasses of water) and their log
-- workouts              logged workouts: from a program (hostel, dumbbells, gym) or the student's own
-- meals                 meals with estimated calories and macros: from a photo (ai-meal; the photo
--                       itself is never stored), a hostel/mess preset or typed in
-- sleep_logs            nights of sleep, typed in or read from Health Connect
-- step_counts           steps per day, typed in or read from Health Connect
-- speaking_sessions     speaking practice: only the transcript and the scores (the audio is
--                       never stored)
--
-- Tested by tests/db/phase1-migration.test.ts and src/lib/demoDb.parity.test.ts (npm test).
-- =============================================================================

create table public.habits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title         text not null check (btrim(title) <> '' and char_length(title) <= 80),
  kind          text not null default 'custom' check (kind in ('sleep', 'gym', 'meal', 'water', 'study', 'custom')),
  days_of_week  smallint[] not null default '{0,1,2,3,4,5,6}'
                check (cardinality(days_of_week) between 1 and 7 and days_of_week <@ '{0,1,2,3,4,5,6}'::smallint[]),
  target        numeric(6, 1) check (target > 0),  -- e.g. 8 (glasses); null = just done or not
  unit          text check (char_length(unit) <= 20),
  order_index   integer not null default 0,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id)
);

create table public.habit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id    uuid not null,
  date        date not null,
  value       numeric(6, 1) not null default 0 check (value >= 0),
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Per user, so another user's insert hits the ownership check below, never this rule (which
  -- would tell them the habit had a log that day).
  unique (user_id, habit_id, date),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);

create table public.workouts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date          date not null,
  title         text not null check (btrim(title) <> '' and char_length(title) <= 80),
  program       text check (program in ('hostel', 'dumbbell', 'gym')),  -- null = the student's own
  day_key       text check (char_length(day_key) <= 10),                -- the program's day, e.g. 'A'
  exercises     jsonb not null default '[]'::jsonb check (jsonb_typeof(exercises) = 'array'),
  duration_min  integer check (duration_min between 1 and 600),
  notes         text check (char_length(notes) <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.meals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  eaten_at     timestamptz not null default now(),
  meal         text not null check (meal in ('breakfast', 'lunch', 'snack', 'dinner')),
  description  text not null check (btrim(description) <> '' and char_length(description) <= 300),
  calories     numeric(6, 1) check (calories between 0 and 10000),  -- estimates
  protein_g    numeric(5, 1) check (protein_g between 0 and 1000),
  carbs_g      numeric(5, 1) check (carbs_g between 0 and 1000),
  fat_g        numeric(5, 1) check (fat_g between 0 and 1000),
  source       text not null default 'manual' check (source in ('photo', 'preset', 'manual')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.sleep_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,  -- the morning the night ended
  bed_at      timestamptz not null,
  wake_at     timestamptz not null,
  minutes     integer not null check (minutes between 0 and 1440),
  source      text not null default 'manual' check (source in ('manual', 'health_connect')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (wake_at > bed_at),
  unique (user_id, date, source)
);

create table public.step_counts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  steps       integer not null check (steps between 0 and 200000),
  source      text not null default 'manual' check (source in ('manual', 'health_connect')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, date, source)
);

create table public.speaking_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scenario      text not null check (scenario in ('interview', 'presentation', 'group_discussion', 'small_talk')),
  prompt        text not null check (btrim(prompt) <> '' and char_length(prompt) <= 500),
  duration_sec  integer not null check (duration_sec between 1 and 1800),
  transcript    text not null default '' check (char_length(transcript) <= 20000),
  words         integer not null default 0 check (words >= 0),
  wpm           numeric(5, 1) check (wpm >= 0),
  filler_count  integer not null default 0 check (filler_count >= 0),
  fillers       jsonb not null default '{}'::jsonb check (jsonb_typeof(fillers) = 'object'),   -- { "um": 3, "matlab": 2 }
  scores        jsonb not null default '{}'::jsonb check (jsonb_typeof(scores) = 'object'),    -- clarity, structure, vocabulary, confidence (1–10)
  feedback      jsonb not null default '[]'::jsonb check (jsonb_typeof(feedback) = 'array'),   -- tips
  source        text not null default 'device' check (source in ('ai', 'device')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Like 001 (sections 4 and 5a): each user reads and changes only their own rows.
do $$
declare
  t text;
begin
  foreach t in array array['habits', 'habit_logs', 'workouts', 'meals', 'sleep_logs', 'step_counts', 'speaking_sessions']
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

-- (habit_logs, sleep_logs and step_counts are found by user_id through their unique indexes.)
create index habits_user_id_idx on public.habits (user_id);
create index habit_logs_habit_idx on public.habit_logs (habit_id);
create index workouts_user_date_idx on public.workouts (user_id, date);
create index meals_user_eaten_idx on public.meals (user_id, eaten_at);
create index speaking_sessions_user_created_idx on public.speaking_sessions (user_id, created_at);

-- Like 001 (5d): signed-out visitors get no access.
revoke all on public.habits, public.habit_logs, public.workouts, public.meals, public.sleep_logs, public.step_counts, public.speaking_sessions from anon;


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
