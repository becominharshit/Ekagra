-- =============================================================================
-- 001_phase1_core.sql
-- Phase 1 ("Working App First") database: every table the Phase 1 app needs
-- (see docs/3-roadmap-and-build-guide.md §0). Phase 2 tables (AI tutor, material
-- search with pgvector, calendar import, habits, feedback) come in a later migration.
--
-- How to read this file:
--   1. Helper functions
--   2. Tables, grouped like docs/2-technical-design.md §6
--   3. Views
--   4. Row Level Security (RLS): each user can only see and change their own rows
--   5. updated_at triggers, indexes, storage buckets, no access for signed-out visitors
--   6. A final safety check that fails the migration if any table lacks RLS
--
-- Tested locally by tests/db/phase1-migration.test.ts (npm test).
--
-- Conventions:
--   * Every table has id, user_id, created_at, updated_at (profiles uses id = auth user id).
--   * user_id defaults to auth.uid(), so the app does not need to send it.
--   * "kind"/"status" columns use CHECK constraints instead of Postgres enums:
--     easier to read and easier to change in a later migration.
--   * Links between a user's rows use composite foreign keys (child_id, user_id)
--     → parent(id, user_id). That makes it impossible to attach your row to
--     another user's row, even by guessing an id.
--   * All timestamps are timestamptz (stored in UTC).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Helpers
-- -----------------------------------------------------------------------------

-- Keeps updated_at correct on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 2a. Core
-- -----------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text,
  avatar_url    text,
  college       text,
  program       text,
  year          smallint check (year between 1 and 8),
  semester      smallint check (semester between 1 and 16),
  timezone      text not null default 'Asia/Kolkata',
  currency      text not null default 'INR',
  chronotype    text not null default 'neutral' check (chronotype in ('early', 'neutral', 'night')),
  mentor_tone   text not null default 'balanced' check (mentor_tone in ('strict', 'balanced', 'friendly')),
  onboarded_at  timestamptz,
  -- Everything the student can customize. Validated with Zod in the app.
  settings      jsonb not null default '{
    "budget":    { "academics": 55, "hustle": 25, "life": 20 },
    "planner":   { "bufferPct": 12, "revisionDays": 10, "maxReviewMinutes": 30, "maxDailyIncreasePct": 20 },
    "focus":     { "pomodoro": { "work": 25, "break": 5 }, "deep": { "work": 50, "break": 10 }, "blockDuring": "focus_sessions" },
    "tollbooth": { "questions": 3, "unlockMinutes": 3, "dailyLimit": 3 },
    "learning":  { "newCardsPerDay": 20, "targetRetention": 0.9, "language": "en" },
    "theme":     "system"
  }'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Creates a profile automatically when someone signs up (name and photo come from Google).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.routine_blocks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('class', 'sleep', 'gym', 'meal', 'commute', 'custom')),
  title         text not null,
  days_of_week  smallint[] not null check (days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]), -- 0 = Sunday
  start_time    time not null,
  end_time      time not null, -- may be earlier than start_time (e.g. sleep crosses midnight)
  valid_from    date,
  valid_to      date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One row per day. "I Crashed" can create it early in the day (minimum_day = true);
-- the evening check-in fills in energy and mood later (1–5 sliders).
create table public.daily_checkins (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date             date not null,
  minimum_day      boolean not null default false,  -- "I Crashed": today shrinks to the essentials
  crashed_at       timestamptz,
  energy           smallint check (energy between 1 and 5),
  mood             smallint check (mood between 1 and 5),
  top_distraction  text,
  note             text,
  checked_in_at    timestamptz,                      -- when the evening check-in was saved
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, date),
  check (not minimum_day or crashed_at is not null),
  check ((energy is null) = (mood is null)),         -- the sliders are saved together
  check (checked_in_at is null or energy is not null)
);


-- -----------------------------------------------------------------------------
-- 2b. Academics
-- -----------------------------------------------------------------------------

create table public.subjects (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 'course' = a university subject; 'skill_course' = created by the Hustle Skill Bridge or "learn anything"
  kind                  text not null default 'course' check (kind in ('course', 'skill_course')),
  name                  text not null,
  code                  text,
  semester              smallint,
  exam_date             date,
  exam_date_estimated   boolean not null default false,
  weekly_minutes_limit  integer check (weekly_minutes_limit > 0), -- used by skill courses
  color                 text,
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, user_id)
);

create table public.topics (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id       uuid not null,
  parent_id        uuid,               -- null = unit; set = topic inside a unit
  title            text not null,
  order_index      integer not null default 0,
  track            text not null default 'exam' check (track in ('exam', 'skill')),
  source           text not null default 'syllabus' check (source in ('syllabus', 'skill_bridge', 'learn_anything', 'manual')),
  est_minutes      integer check (est_minutes between 5 and 600),
  difficulty       smallint check (difficulty between 1 and 5),
  exam_weight      numeric(4, 3) not null default 0 check (exam_weight between 0 and 1),
  pyq_count        integer not null default 0 check (pyq_count >= 0),
  pyq_marks_share  numeric(4, 3) not null default 0 check (pyq_marks_share between 0 and 1),
  last_asked_year  smallint,
  -- 0.45 × examWeight + 0.35 × pyqScore + 0.20 × dependentsScore (computed in TypeScript)
  priority_score   numeric(5, 4) not null default 0 check (priority_score between 0 and 1),
  status           text not null default 'not_started' check (status in ('not_started', 'learning', 'review', 'mastered')),
  mastery          numeric(4, 3) not null default 0 check (mastery between 0 and 1),
  target_date      date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade,
  foreign key (parent_id, user_id) references public.topics (id, user_id) on delete cascade
);

create table public.topic_prereqs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id         uuid not null,
  prereq_topic_id  uuid not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (topic_id, prereq_topic_id),
  check (topic_id <> prereq_topic_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete cascade,
  foreign key (prereq_topic_id, user_id) references public.topics (id, user_id) on delete cascade
);

create table public.materials (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id    uuid,
  kind          text not null check (kind in ('pdf', 'youtube', 'video', 'audio', 'image', 'text', 'drive')),
  purpose       text not null default 'study' check (purpose in ('study', 'syllabus', 'past_paper')),
  title         text not null,
  storage_path  text,   -- path inside the private "materials" bucket: <user_id>/<file>
  source_url    text,
  page_count    integer check (page_count >= 0),
  duration_sec  integer check (duration_sec >= 0),
  status        text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'failed')),
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id)
);

create table public.material_pages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id  uuid not null,
  page_no      integer not null check (page_no >= 1),
  text         text not null default '',
  needs_ocr    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (material_id, page_no),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete cascade
);

create table public.material_sections (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id  uuid not null,
  order_index  integer not null default 0,
  title        text not null,
  page_start   integer,
  page_end     integer,
  ts_start     integer,  -- seconds, for videos
  ts_end       integer,
  summary      text,
  topic_id     uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete cascade,
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id)
);

-- 1-click AI anchors in the PDF viewer: the student selects text on a page,
-- taps an action, and the AI answer is saved next to that spot.
create table public.ai_anchors (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id     uuid not null,
  page_no         integer not null check (page_no >= 1),
  selected_text   text,
  rect            jsonb,  -- { "x": 0–1, "y": 0–1, "w": 0–1, "h": 0–1 } relative to the page size
  action          text not null check (action in ('explain', 'simplify', 'example', 'flashcards', 'ask')),
  question        text,
  response_md     text,
  topic_id        uuid,
  model           text,
  prompt_version  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete cascade,
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id)
);

-- One cached lesson per topic (lazy generation; "Regenerate" overwrites it).
create table public.lessons (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id        uuid not null,
  content_md      text not null,
  sources         jsonb not null default '[]'::jsonb,
  prompt_version  text,
  model           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (topic_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete cascade
);

create table public.past_papers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id   uuid not null,
  material_id  uuid,
  year         smallint,
  exam_type    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade,
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete set null (material_id)
);

create table public.questions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id      uuid,
  topic_id        uuid,   -- null for past-paper questions that matched no topic
  past_paper_id   uuid,
  source          text not null check (source in ('generated', 'pyq', 'manual')),
  type            text not null check (type in ('mcq', 'short', 'numerical', 'code', 'long')),
  prompt          text not null,
  options         jsonb,
  answer          jsonb,
  explanation     text,
  marks           numeric(5, 2),
  difficulty      smallint check (difficulty between 1 and 5),
  rating          integer,  -- Elo rating (used from P2)
  tests           jsonb,    -- test cases for code questions
  source_ref      jsonb,    -- page / timestamp / section the question came from
  year            smallint,
  prompt_version  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade,
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete cascade,
  foreign key (past_paper_id, user_id) references public.past_papers (id, user_id) on delete set null (past_paper_id)
);

create table public.quizzes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 'tollbooth' = the 3 rapid-fire questions for a FocusGuard emergency unlock
  kind            text not null check (kind in ('check', 'topic', 'subject', 'mock', 'tollbooth')),
  subject_id      uuid,
  topic_ids       uuid[] not null default '{}',
  time_limit_sec  integer check (time_limit_sec > 0),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  score           numeric(5, 4) check (score between 0 and 1),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id)
);

create table public.attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id  uuid not null,
  quiz_id      uuid,
  answer       jsonb,
  is_correct   boolean,
  score        numeric(5, 4) check (score between 0 and 1),
  time_ms      integer check (time_ms >= 0),
  hints_used   smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (question_id, user_id) references public.questions (id, user_id) on delete cascade,
  foreign key (quiz_id, user_id) references public.quizzes (id, user_id) on delete cascade
);

create table public.flashcards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id     uuid,
  material_id  uuid,
  anchor_id    uuid,  -- set when the card was made from an AI Anchor in the PDF viewer
  front        text not null,
  back         text not null,
  source       text not null default 'generated' check (source in ('generated', 'anchor', 'manual', 'mistake')),
  fsrs         jsonb not null default '{}'::jsonb,  -- ts-fsrs card state
  due_at       timestamptz not null default now(),
  suspended    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete cascade,
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete set null (material_id),
  foreign key (anchor_id, user_id) references public.ai_anchors (id, user_id) on delete set null (anchor_id)
);

create table public.flashcard_reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  flashcard_id  uuid not null,
  rating        smallint not null check (rating between 1 and 4), -- Again / Hard / Good / Easy
  reviewed_at   timestamptz not null default now(),
  duration_ms   integer check (duration_ms >= 0),
  log           jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (flashcard_id, user_id) references public.flashcards (id, user_id) on delete cascade
);

-- In-app Python Coding Lab (CodeMirror 6 + Pyodide).
create table public.code_snippets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id     uuid,
  question_id  uuid,
  title        text not null default 'Untitled',
  language     text not null default 'python' check (language in ('python')),
  code         text not null default '',
  last_output  text,
  last_run_at  timestamptz,
  passed       boolean,  -- all tests passed (when linked to a code question)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id),
  foreign key (question_id, user_id) references public.questions (id, user_id) on delete set null (question_id)
);

-- Mistake notebook. Review ladder: 1 → 3 → 7 days. Fixed after 2 correct answers on different days.
create table public.mistakes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id          uuid,
  question_id       uuid,
  flashcard_id      uuid,
  code_snippet_id   uuid,
  concept           text not null,
  why_wrong         text,
  correct_approach  text,
  status            text not null default 'open' check (status in ('open', 'fixed')),
  ladder_step       smallint not null default 0 check (ladder_step between 0 and 2), -- 0 → 1 day, 1 → 3 days, 2 → 7 days
  correct_count     smallint not null default 0 check (correct_count >= 0),
  last_correct_on   date,
  next_review_at    timestamptz not null default (now() + interval '1 day'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id),
  foreign key (question_id, user_id) references public.questions (id, user_id) on delete set null (question_id),
  foreign key (flashcard_id, user_id) references public.flashcards (id, user_id) on delete set null (flashcard_id),
  foreign key (code_snippet_id, user_id) references public.code_snippets (id, user_id) on delete set null (code_snippet_id)
);


-- -----------------------------------------------------------------------------
-- 2c. Hustle (moved from P3 to P1)
-- Created before tasks/plan_blocks because those link to hustles.
-- -----------------------------------------------------------------------------

create table public.hustles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type             text not null check (type in ('freelancing', 'content', 'startup', 'custom')),
  name             text not null,
  goal             text,
  goal_amount      numeric(12, 2) check (goal_amount >= 0),
  goal_date        date,
  currency         text not null default 'INR',
  -- Kanban columns, copied from the template and editable, e.g. {proposal,active,delivered,paid}
  pipeline_stages  text[] not null default '{}',
  status           text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id)
);

create table public.hustle_phases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  hustle_id     uuid not null,
  order_index   integer not null default 0,
  title         text not null,
  status        text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id),
  foreign key (hustle_id, user_id) references public.hustles (id, user_id) on delete cascade
);

create table public.hustle_steps (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  phase_id          uuid not null,
  order_index       integer not null default 0,
  title             text not null,
  done              boolean not null default false,
  skill_name        text,  -- the skill this step needs, e.g. "Video editing"
  -- Skill Bridge: "Learn this" creates a skill course (subject) with skill-track topics
  skill_subject_id  uuid,
  skill_topic_id    uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (phase_id, user_id) references public.hustle_phases (id, user_id) on delete cascade,
  foreign key (skill_subject_id, user_id) references public.subjects (id, user_id) on delete set null (skill_subject_id),
  foreign key (skill_topic_id, user_id) references public.topics (id, user_id) on delete set null (skill_topic_id)
);

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  hustle_id   uuid,
  name        text not null,
  platform    text,
  contact     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  foreign key (hustle_id, user_id) references public.hustles (id, user_id) on delete set null (hustle_id)
);

-- Cards on the Kanban pipeline board.
create table public.hustle_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  hustle_id    uuid not null,
  kind         text not null default 'other' check (kind in ('order', 'content', 'experiment', 'session', 'other')),
  title        text not null,
  stage        text not null,             -- one of hustles.pipeline_stages (checked in the app)
  order_index  double precision not null default 0, -- position inside the column (fractional for easy drag & drop)
  client_id    uuid,
  amount       numeric(12, 2) check (amount >= 0),
  currency     text,
  due_at       timestamptz,
  url          text,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id),
  foreign key (hustle_id, user_id) references public.hustles (id, user_id) on delete cascade,
  foreign key (client_id, user_id) references public.clients (id, user_id) on delete set null (client_id)
);

create table public.transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  hustle_id       uuid not null,
  client_id       uuid,
  hustle_item_id  uuid,
  kind            text not null check (kind in ('income', 'expense')),
  amount          numeric(12, 2) not null check (amount > 0),
  currency        text not null default 'INR',
  occurred_on     date not null default current_date,
  category        text,
  note            text,
  source          text not null default 'manual' check (source in ('manual', 'gmail', 'paypal', 'stripe', 'sms')),
  source_ref      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (hustle_id, user_id) references public.hustles (id, user_id) on delete cascade,
  foreign key (client_id, user_id) references public.clients (id, user_id) on delete set null (client_id),
  foreign key (hustle_item_id, user_id) references public.hustle_items (id, user_id) on delete set null (hustle_item_id)
);


-- -----------------------------------------------------------------------------
-- 2d. Planning, tasks, focus
-- -----------------------------------------------------------------------------

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  area          text not null default 'personal' check (area in ('academics', 'hustle', 'life', 'personal')),
  subject_id    uuid,
  hustle_id     uuid,
  title         text not null,
  notes         text,
  due_at        timestamptz,
  est_minutes   integer check (est_minutes > 0),
  priority      smallint not null default 2 check (priority between 1 and 4),
  status        text not null default 'todo' check (status in ('todo', 'doing', 'done', 'skipped')),
  source        text not null default 'manual' check (source in ('manual', 'text', 'screenshot', 'share', 'gmail', 'calendar', 'ai')),
  source_ref    text,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id),
  foreign key (hustle_id, user_id) references public.hustles (id, user_id) on delete set null (hustle_id)
);

create table public.plan_blocks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date             date not null,   -- the local day the block belongs to
  start_at         timestamptz not null,
  end_at           timestamptz not null,
  area             text not null check (area in ('academics', 'hustle', 'life', 'personal', 'none')),
  kind             text not null check (kind in ('learn', 'review', 'practice', 'task', 'hustle', 'life', 'break', 'buffer', 'fixed')),
  subject_id       uuid,
  topic_id         uuid,
  task_id          uuid,
  hustle_id        uuid,
  title            text not null,
  planned_minutes  integer not null check (planned_minutes >= 0),
  actual_minutes   integer check (actual_minutes >= 0),
  status           text not null default 'planned' check (status in ('planned', 'in_progress', 'done', 'partial', 'missed', 'moved')),
  at_risk          boolean not null default false,
  plan_version     integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  check (end_at > start_at),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id),
  foreign key (hustle_id, user_id) references public.hustles (id, user_id) on delete set null (hustle_id)
);

create table public.focus_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_block_id    uuid,
  area             text not null check (area in ('academics', 'hustle', 'life', 'personal')),
  subject_id       uuid,
  hustle_id        uuid,
  mode             text not null check (mode in ('pomodoro', 'deep', 'custom')),
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  planned_minutes  integer not null check (planned_minutes > 0),
  actual_minutes   integer check (actual_minutes >= 0),
  outcome          text check (outcome in ('done', 'partial', 'stopped')),
  completed        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  foreign key (plan_block_id, user_id) references public.plan_blocks (id, user_id) on delete set null (plan_block_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id),
  foreign key (hustle_id, user_id) references public.hustles (id, user_id) on delete set null (hustle_id)
);

-- Hustle hours (for earnings per hour). Hustle focus sessions add rows automatically.
create table public.time_entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  hustle_id         uuid not null,
  client_id         uuid,
  focus_session_id  uuid,
  started_at        timestamptz not null,
  ended_at          timestamptz,
  minutes           integer not null check (minutes > 0),
  source            text not null default 'manual' check (source in ('focus', 'manual')),
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (hustle_id, user_id) references public.hustles (id, user_id) on delete cascade,
  foreign key (client_id, user_id) references public.clients (id, user_id) on delete set null (client_id),
  foreign key (focus_session_id, user_id) references public.focus_sessions (id, user_id) on delete set null (focus_session_id)
);

create table public.distraction_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  focus_session_id  uuid,
  at                timestamptz not null default now(),
  -- tollbooth_unlock / tollbooth_failed: the Academic Tollbooth (3 rapid-fire questions from
  -- your active subject) passed → blocked apps open for 3 minutes, or failed → they stay blocked.
  kind              text not null check (kind in ('self_report', 'blocked_open', 'tollbooth_unlock', 'tollbooth_failed', 'mode_switch')),
  app_package       text,
  reason            text,   -- mode switch: done_early | urgent | break | other (+ free text)
  from_mode         text check (from_mode in ('study', 'hustle', 'life', 'free')),
  to_mode           text check (to_mode in ('study', 'hustle', 'life', 'free')),
  quiz_id           uuid,   -- the tollbooth quiz
  unlock_until      timestamptz,  -- tollbooth_unlock: apps stay open until this time
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (kind <> 'tollbooth_unlock' or unlock_until is not null),
  foreign key (focus_session_id, user_id) references public.focus_sessions (id, user_id) on delete set null (focus_session_id),
  foreign key (quiz_id, user_id) references public.quizzes (id, user_id) on delete set null (quiz_id)
);

create table public.blocked_apps (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  package_name  text not null,
  label         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, package_name)
);


-- -----------------------------------------------------------------------------
-- 2e. System
-- -----------------------------------------------------------------------------

-- Background work for the worker Edge Function. Users can only READ their jobs;
-- jobs are created and updated by Edge Functions (service role).
create table public.jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts    smallint not null default 0,
  run_after   timestamptz not null default now(),
  locked_at   timestamptz,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- AI cost log. Written only by supabase/functions/_shared/ai.ts (service role); users can read their own.
create table public.ai_usage (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  feature        text not null,
  model          text not null,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  cost_usd       numeric(10, 6) not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- 3. Views
-- -----------------------------------------------------------------------------

-- Earnings per hour = net profit ÷ hours logged, per hustle.
-- security_invoker = true means the view runs with the caller's permissions,
-- so RLS on hustles/transactions/time_entries still applies.
create view public.hustle_earnings
with (security_invoker = true)
as
select
  h.id                                            as hustle_id,
  h.user_id,
  h.name,
  h.currency,
  coalesce(t.income, 0)                           as income,
  coalesce(t.expense, 0)                          as expense,
  coalesce(t.income, 0) - coalesce(t.expense, 0)  as net_profit,
  coalesce(te.minutes, 0)                         as minutes_logged,
  round(coalesce(te.minutes, 0) / 60.0, 2)        as hours_logged,
  case
    when coalesce(te.minutes, 0) > 0
      then round((coalesce(t.income, 0) - coalesce(t.expense, 0)) / (te.minutes / 60.0), 2)
  end                                             as earnings_per_hour
from public.hustles h
left join (
  select hustle_id,
         sum(amount) filter (where kind = 'income')  as income,
         sum(amount) filter (where kind = 'expense') as expense
  from public.transactions
  group by hustle_id
) t on t.hustle_id = h.id
left join (
  select hustle_id, sum(minutes) as minutes
  from public.time_entries
  group by hustle_id
) te on te.hustle_id = h.id;


-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------

-- profiles: the row id IS the user id. Rows are created by the sign-up trigger,
-- so users can read and update their own profile but not insert or delete it
-- (account deletion removes it through the auth.users cascade).
alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Normal user-owned tables: four policies each (select, insert, update, delete),
-- all with the rule "user_id = the signed-in user".
-- (select auth.uid()) is wrapped in a sub-select so Postgres calls it once per query, not once per row.
do $$
declare
  t text;
begin
  foreach t in array array[
    'routine_blocks', 'daily_checkins',
    'subjects', 'topics', 'topic_prereqs', 'materials', 'material_pages', 'material_sections',
    'ai_anchors', 'lessons', 'past_papers', 'questions', 'quizzes', 'attempts',
    'flashcards', 'flashcard_reviews', 'code_snippets', 'mistakes',
    'hustles', 'hustle_phases', 'hustle_steps', 'clients', 'hustle_items', 'transactions',
    'tasks', 'plan_blocks', 'focus_sessions', 'time_entries',
    'distraction_events', 'blocked_apps'
  ]
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
  end loop;
end;
$$;

-- jobs and ai_usage: read-only for users. Only Edge Functions (service role, which bypasses RLS) write them.
alter table public.jobs enable row level security;
create policy jobs_select_own on public.jobs
  for select to authenticated using (user_id = (select auth.uid()));

alter table public.ai_usage enable row level security;
create policy ai_usage_select_own on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- 5a. updated_at triggers and user_id indexes on every table
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'routine_blocks', 'daily_checkins',
    'subjects', 'topics', 'topic_prereqs', 'materials', 'material_pages', 'material_sections',
    'ai_anchors', 'lessons', 'past_papers', 'questions', 'quizzes', 'attempts',
    'flashcards', 'flashcard_reviews', 'code_snippets', 'mistakes',
    'hustles', 'hustle_phases', 'hustle_steps', 'clients', 'hustle_items', 'transactions',
    'tasks', 'plan_blocks', 'focus_sessions', 'time_entries',
    'distraction_events', 'blocked_apps',
    'jobs', 'ai_usage'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    if t <> 'profiles' then
      execute format('create index %I on public.%I (user_id)', t || '_user_id_idx', t);
    end if;
  end loop;
end;
$$;

-- 5b. Indexes for common queries
create index topics_subject_idx             on public.topics (subject_id, order_index);
create index topics_parent_idx              on public.topics (parent_id);
create index materials_subject_idx          on public.materials (subject_id);
create index material_sections_material_idx on public.material_sections (material_id, order_index);
create index ai_anchors_material_page_idx   on public.ai_anchors (material_id, page_no);
create index questions_topic_idx            on public.questions (topic_id);
create index questions_subject_idx          on public.questions (subject_id);
create index attempts_question_idx          on public.attempts (question_id, created_at desc);
create index flashcards_due_idx             on public.flashcards (user_id, due_at) where not suspended;
create index flashcards_topic_idx           on public.flashcards (topic_id);
create index mistakes_review_idx            on public.mistakes (user_id, next_review_at) where status = 'open';
create index tasks_due_idx                  on public.tasks (user_id, due_at) where status in ('todo', 'doing');
create index plan_blocks_day_idx            on public.plan_blocks (user_id, date, start_at);
create index focus_sessions_started_idx     on public.focus_sessions (user_id, started_at desc);
create index distraction_events_at_idx      on public.distraction_events (user_id, at desc);
create index hustle_items_board_idx         on public.hustle_items (hustle_id, stage, order_index);
create index transactions_hustle_idx        on public.transactions (hustle_id, occurred_on desc);
create index time_entries_hustle_idx        on public.time_entries (hustle_id, started_at desc);
create index jobs_queue_idx                 on public.jobs (status, run_after) where status in ('pending', 'running');
create index ai_usage_created_idx           on public.ai_usage (user_id, created_at desc);


-- -----------------------------------------------------------------------------
-- 5c. Storage: private buckets, files live under <user_id>/...
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('materials', 'materials', false, 52428800, array['application/pdf']),
  ('images',    'images',    false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy storage_select_own on storage.objects
  for select to authenticated
  using (bucket_id in ('materials', 'images') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy storage_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id in ('materials', 'images') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy storage_update_own on storage.objects
  for update to authenticated
  using (bucket_id in ('materials', 'images') and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('materials', 'images') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy storage_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id in ('materials', 'images') and (storage.foldername(name))[1] = (select auth.uid())::text);


-- -----------------------------------------------------------------------------
-- 5d. Signed-out visitors ("anon") get no access at all.
-- RLS already shows them nothing; removing their table permissions is a second lock.
-- Trigger functions are only run by Postgres itself, so nobody needs to call them.
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke execute on function public.set_updated_at() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 6. Safety check: stop the migration if any table in "public" has no RLS.
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
