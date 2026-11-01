-- =============================================================================
-- Ekagra: Beta (Milestone 10)
--
-- In-app feedback. The "Send feedback" sheet (top bar and Me) saves a message with the screen it
-- was sent from, a few device details and, if the student adds one, a screenshot. Screenshots go
-- in the private "images" bucket at <user_id>/feedback/<feedback id>.<png|jpg|webp> (the storage
-- rules from 001 already allow that folder).
--
-- Students can send, read and delete their own feedback, but not change it. The founder reads
-- everything in the Supabase dashboard (Table Editor → feedback, which skips RLS) and sets the
-- status there; students see it under Me → Feedback.
--
-- Tested by tests/db/phase1-migration.test.ts and src/lib/demoDb.parity.test.ts (npm test).
-- =============================================================================

create table public.feedback (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind             text not null check (kind in ('bug', 'idea', 'other')),
  message          text not null check (btrim(message) <> '' and char_length(message) <= 4000),
  screen           text,  -- the screen's name, e.g. 'PDF viewer' (filled in by the app, the student can change it)
  path             text,  -- the app address it was sent from, e.g. '/academics/library/<id>'
  screenshot_path  text,  -- in the "images" bucket; null = no screenshot
  -- app (web or android), build time, screen size, browser, language and timezone
  context          jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  -- new → seen → planned → fixed, or closed. Only the founder changes it (in the dashboard).
  status           text not null default 'new' check (status in ('new', 'seen', 'planned', 'fixed', 'closed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Like 001 (section 4), but without update: new feedback always starts as 'new'.
alter table public.feedback enable row level security;

create policy feedback_select_own on public.feedback
  for select to authenticated using (user_id = (select auth.uid()));
create policy feedback_insert_own on public.feedback
  for insert to authenticated with check (user_id = (select auth.uid()) and status = 'new');
create policy feedback_delete_own on public.feedback
  for delete to authenticated using (user_id = (select auth.uid()));

create trigger set_updated_at before update on public.feedback
  for each row execute function public.set_updated_at();

-- "My feedback, newest first" (also used when a user is deleted).
create index feedback_user_created_idx on public.feedback (user_id, created_at desc);

-- Like 001 (5d): signed-out visitors get no access.
revoke all on public.feedback from anon;


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
