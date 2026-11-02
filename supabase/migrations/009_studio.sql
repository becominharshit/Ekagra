-- =============================================================================
-- Ekagra: notes from Ekagra Studio (App #2)
--
-- notes   notes, mind maps and revision sheets for a subject (and maybe one of its topics),
--         made in Ekagra Studio from a material (a PDF, photo, text or YouTube video: all of
--         them are rows in materials) or written there. Ekagra only shows them, under each
--         subject. Long ones are made in the background: status 'processing', then 'ready'
--         (or 'failed', with the error).
--
-- Ekagra and Ekagra Studio use this one database. Signed in with the same account, each app
-- sees the other's rows: Studio files notes under Ekagra's subjects, and its quizzes go into
-- questions, quizzes and attempts (001) like Ekagra's own, so progress counts them.
--
-- Tested by tests/db/phase1-migration.test.ts and src/lib/demoDb.parity.test.ts (npm test).
-- =============================================================================

create table public.notes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id      uuid not null,
  topic_id        uuid,
  material_id     uuid,  -- what it was made from; null = written by hand (or the material was deleted)
  kind            text not null default 'notes' check (kind in ('notes', 'mind_map', 'revision_sheet')),
  title           text not null check (btrim(title) <> '' and char_length(title) <= 200),
  content         text not null default '' check (char_length(content) <= 500000),  -- Markdown; a mind map is a Markdown outline
  source          text not null default 'manual' check (source in ('manual', 'material', 'youtube')),
  status          text not null default 'ready' check (status in ('processing', 'ready', 'failed')),
  error           text check (char_length(error) <= 1000),
  model           text,
  prompt_version  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade,
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete set null (material_id)
);

-- Like 001 (sections 4 and 5a): each user reads and changes only their own rows.
alter table public.notes enable row level security;
create policy notes_select_own on public.notes for select to authenticated using (user_id = (select auth.uid()));
create policy notes_insert_own on public.notes for insert to authenticated with check (user_id = (select auth.uid()));
create policy notes_update_own on public.notes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notes_delete_own on public.notes for delete to authenticated using (user_id = (select auth.uid()));

create trigger set_updated_at before update on public.notes for each row execute function public.set_updated_at();

-- A subject's notes, newest first (this also serves deleting a subject's notes).
create index notes_user_subject_idx on public.notes (user_id, subject_id, updated_at desc);
create index notes_topic_idx on public.notes (topic_id);
create index notes_material_idx on public.notes (material_id);

-- Like 001 (5d): signed-out visitors get no access.
revoke all on public.notes from anon;


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
