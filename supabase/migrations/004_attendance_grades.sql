-- =============================================================================
-- Ekagra: Attendance and grades (Milestone 12, the first Phase 2 milestone)
--
-- 1. A class block in the routine can name its subject (routine_blocks.subject_id), e.g.
--    "DBMS, Mon and Wed 09:00–10:00". Today then asks "Were you in DBMS?" for those classes.
-- 2. attendance: one row per class, present, absent or cancelled (a cancelled class doesn't
--    count). Classes from the routine keep their start time, so marking one again changes the
--    same row; classes added by hand have no start time.
-- 3. marks: internal and assignment marks per subject.
-- 4. subjects.credits and subjects.grade (the final or expected grade, a letter of the grade scale
--    in profiles.settings) give the SGPA; semester_results holds earlier semesters for the CGPA.
--
-- Tested by tests/db/phase1-migration.test.ts and src/lib/demoDb.parity.test.ts (npm test).
-- =============================================================================

alter table public.routine_blocks add column subject_id uuid;
alter table public.routine_blocks
  add constraint routine_blocks_subject_id_user_id_fkey
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id);

alter table public.subjects
  add column credits numeric(3, 1) check (credits > 0 and credits <= 30),
  add column grade text check (char_length(grade) between 1 and 4);

create table public.attendance (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id  uuid not null,
  date        date not null,
  start_time  time,  -- the class's start in the routine; null = added by hand
  status      text not null check (status in ('present', 'absent', 'cancelled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade
);

-- One row per class from the routine (rows added by hand have no start time, so they never clash).
create unique index attendance_class_idx on public.attendance (user_id, subject_id, date, start_time);

create table public.marks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id  uuid not null,
  assessment  text not null check (btrim(assessment) <> '' and char_length(assessment) <= 80),  -- e.g. 'Internal 1'
  max_marks   numeric(6, 2) not null check (max_marks > 0),
  obtained    numeric(6, 2) not null check (obtained >= 0 and obtained <= max_marks),
  date        date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade
);

-- Earlier semesters, typed in from the marksheet. The current one comes from the subjects.
create table public.semester_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  semester    smallint not null check (semester between 1 and 16),
  sgpa        numeric(4, 2) not null check (sgpa between 0 and 10),
  credits     numeric(5, 1) not null check (credits > 0 and credits <= 100),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, semester)
);

-- Like 001 (sections 4 and 5a): each user reads and changes only their own rows.
do $$
declare
  t text;
begin
  foreach t in array array['attendance', 'marks', 'semester_results']
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

-- (attendance and semester_results are already found by user_id through their unique indexes.)
create index attendance_subject_idx on public.attendance (subject_id, date);
create index marks_user_id_idx on public.marks (user_id);
create index marks_subject_idx on public.marks (subject_id);
create index routine_blocks_subject_idx on public.routine_blocks (subject_id);

-- Like 001 (5d): signed-out visitors get no access.
revoke all on public.attendance, public.marks, public.semester_results from anon;


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
