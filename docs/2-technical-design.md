# Technical Design

## 1. Principles

1. **Popular, well-documented tools.** AI coding assistants know them best, and help is easy to find.
2. **One language.** TypeScript for the app and the backend.
3. **Managed services with free tiers.** No servers to maintain.
4. **AI understands and writes; normal code calculates.** Scheduling, metrics and spaced repetition are tested code, not AI guesses.
5. **Secure from day one.** Row Level Security on every table; secrets only on the server.
6. **Cheap by design.** Generate content only when needed, cache everything, use the cheapest model that does the job.

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| UI | React + TypeScript + Vite | The most common web stack; AI tools write it well |
| Styling and components | Tailwind CSS + shadcn/ui | Fast to build, good-looking, easy to customize |
| Routing | React Router | Simple and well known |
| Server data | supabase-js + TanStack Query | Caching, loading states, offline cache |
| Local state | Zustand | Small and simple |
| Validation | Zod | Same schemas for forms and AI output |
| Dates | date-fns + date-fns-tz | Timezone-safe dates |
| Android | Capacitor | Wraps the web app as an Android app; native plugins for blocking, notifications, camera, share |
| Backend | Supabase | Postgres, Auth (Google), Storage, Edge Functions, Cron, Vault, pgvector |
| AI calls | Vercel AI SDK (or the provider's REST API) inside Edge Functions | Switch models and providers through config |
| PDF | pdf.js (`react-pdf` viewer; text extraction on the device) | Free; avoids server CPU limits |
| Code editor (P2) | CodeMirror 6 | Lighter than Monaco and works on phones |
| Python runner (P2) | Pyodide in a Web Worker | Real Python inside the app, free |
| Spaced repetition | `ts-fsrs` | Open-source FSRS algorithm |
| Charts | Recharts | Simple charts |
| Tests | Vitest | Unit tests for planner and metrics |
| Web hosting | Vercel, Netlify or Cloudflare Pages (free) | Static hosting, auto-deploy from GitHub |
| Android beta | Firebase App Distribution or direct APK | Free; Play Store later |
| Crash reports (optional) | Sentry free tier | See errors from friends' phones |

**Why React + Capacitor instead of Expo/React Native or Flutter:**
- AI will write most of the code, and plain React + Tailwind is what AI tools write most reliably. Debugging happens in the browser.
- Most of this app is reading PDFs, quizzes, code editing and charts, which web libraries handle best. The future Tools app (notes, diagrams, PDF editing) is also web-heavy and can share code.
- Android-only parts (app blocking, share target, Health Connect) are small native plugins.
- Trade-off: slightly less "native" feel than React Native. Acceptable for this app.

## 3. Architecture

```
┌──────────────────────── One codebase: React + TypeScript ────────────────────────┐
│  Web app (browser)              Android app (Capacitor)                           │
│                                 + native: FocusGuard (app blocker), local         │
│                                   notifications, camera, share target,            │
│                                   Health Connect (P4)                             │
│  Runs locally: planner, FSRS, metrics, PDF text extraction (pure TypeScript)      │
└──────────────┬──────────────────────────────────────────────┬────────────────────┘
               │ supabase-js: login, database, files          │ calls Edge Functions
               ▼                                              ▼
┌──────────────────────────────────── Supabase ────────────────────────────────────┐
│  Postgres + RLS + pgvector · Auth (Google) · Storage (PDFs, images) · Vault       │
│  Edge Functions: ai-syllabus, ai-papers, ai-capture, ai-generate, ai-grade,       │
│    ai-tutor, ai-brief, ai-hustle, worker · P2: ai-review, ai-hint, oauth-google · │
│    ai-usage, account-delete (no AI) · P3: integrations                            │
│  Cron: job worker every minute · P2 weekly review · P3 integration sync           │
└──────────────┬──────────────────────────────────────────────┬────────────────────┘
               ▼                                              ▼
   AI provider (Smart / Fast / Embedding tiers)    Google, YouTube, Instagram,
                                                   GitHub, Notion, PayPal/Stripe APIs
```

## 4. Folder structure

```
student-mentor-app/
├── AGENTS.md                    rules for AI coding tools
├── README.md
├── docs/
├── src/
│   ├── pages/                   screens (today, academics, hustle, life, me, focus, onboarding)
│   ├── components/              shared UI (shadcn/ui lives in components/ui)
│   ├── features/                logic per module
│   │   ├── planner/             pure TypeScript planner + tests
│   │   └── academics/ tasks/ focus/ life/ hustle/ metrics/
│   ├── lib/
│   │   ├── supabase.ts          Supabase client
│   │   ├── native/focusGuard.ts TypeScript wrapper for the Kotlin plugin
│   │   ├── native/fileSaver.ts  saving the data export (Kotlin FileSaver on Android)
│   │   └── dates.ts             timezone helpers
│   └── types/database.ts        generated from the database
├── android/                     Capacitor Android project (Kotlin: FocusGuard, FileSaver)
├── supabase/
│   ├── migrations/              SQL: tables + RLS policies
│   └── functions/
│       ├── _shared/             ai.ts, prompts/, schemas.ts (Zod), respond.ts (HTTP), admin.ts (secret key),
│       │                        userTables.ts (every table with student rows)
│       └── ai-syllabus/ ai-papers/ ai-capture/ ai-generate/ ai-grade/ ai-tutor/ ai-brief/ ai-hustle/ worker/
│           ai-usage/ account-delete/   (no AI call)
├── capacitor.config.ts
├── .env.example
└── package.json
```

## 5. Environment variables

```
# App (.env): public values only
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=      # called "anon key" in older Supabase projects
VITE_CONTACT_EMAIL=                 # optional: the contact on the privacy page (M10)

# Edge Function secrets (set with the Supabase CLI or dashboard)
AI_PROVIDER=                        # e.g. google
AI_API_KEY=
AI_MODEL_SMART=                     # top model: syllabus, past papers, weekly review
AI_MODEL_FAST=                      # cheap model: lessons, quizzes, capture, tutor, OCR
AI_MODEL_EMBED=                     # embedding model
AI_MONTHLY_BUDGET_USD=10
AI_USER_DAILY_REQUESTS=150
YOUTUBE_API_KEY=
GOOGLE_OAUTH_CLIENT_ID=             # P2 integrations
GOOGLE_OAUTH_CLIENT_SECRET=
```

## 6. Data model

Every table has `id uuid`, `created_at` and `updated_at`, and an RLS policy `user_id = auth.uid()` (unless noted). Phase tags mark tables created later.

```
── Core ──────────────────────────────────────────────────────────────────────
profiles            id (= auth user id), full_name, college, program, year, semester,
                    timezone, currency (default INR), chronotype (early|neutral|night),
                    mentor_tone (strict|balanced|friendly), settings jsonb (since M12 also
                    attendance { minPercent, classesEndOn } and grades { scale }; since M13
                    planner.maxBlockMinutes, planner.subjectWindows { subjectId: morning|
                    afternoon|evening|night } and review { day 0–6, reminder }; since M14
                    life { program hostel|dumbbell|gym|null, workoutDays, calories, protein,
                    stepGoal })
routine_blocks      user_id, kind (class|sleep|gym|meal|commute|custom), title,
                    days_of_week int[], start_time, end_time, valid_from, valid_to,
                    subject_id (class blocks: the subject taught then, for attendance; M12)
daily_checkins      user_id, date, energy 1–5, mood 1–5, top_distraction, note

── Academics ─────────────────────────────────────────────────────────────────
subjects            user_id, name, code, semester, exam_date, exam_date_estimated, color,
                    credits, grade (a letter of the grade scale in settings; M12)
topics              user_id, subject_id, parent_id (unit → topic), title, order_index,
                    track (exam|skill), est_minutes, difficulty 1–5, exam_weight 0–1,
                    pyq_count, pyq_marks_share, priority_score,
                    status (not_started|learning|review|mastered), mastery 0–1, target_date,
                    learned_at (the first check quiz of 80% or more, for learning speed; M11)
topic_prereqs       topic_id, prereq_topic_id
materials           user_id, subject_id, kind (pdf|youtube|video|audio|image|text|drive),
                    title, storage_path, source_url, page_count, duration_sec,
                    status (uploaded|processing|ready|failed), error
material_pages      material_id, user_id, page_no, text, needs_ocr
material_sections   material_id, user_id, order_index, title, page_start, page_end,
                    ts_start, ts_end, summary, topic_id
material_chunks     material_id, section_id, user_id, content, page_no, ts_start,
                    embedding vector(N)
lessons             user_id, topic_id, content_md, sources jsonb, prompt_version, model
questions           user_id, topic_id, source (generated|pyq|manual),
                    type (mcq|short|numerical|code|long), prompt, options jsonb,
                    answer jsonb, explanation, marks, difficulty 1–5, rating (Elo; M11),
                    tests jsonb (code, P2), source_ref
quizzes             user_id, kind (check|topic|subject|mock), subject_id, topic_ids uuid[],
                    time_limit_sec, started_at, finished_at, score (0–1)
                    (subject = an adaptive practice session, mock = a mock test; M11)
attempts            user_id, question_id, quiz_id, answer jsonb, is_correct, score,
                    time_ms, hints_used (mock tests keep the marks, who marked them,
                    feedback and the model answer in answer; time_ms only for quick answers)
flashcards          user_id, topic_id, front, back, source, fsrs jsonb, due_at, suspended
flashcard_reviews   user_id, flashcard_id, rating 1–4, reviewed_at, duration_ms, log jsonb
mistakes            user_id, topic_id, question_id, flashcard_id, concept, why_wrong,
                    correct_approach, status (open|fixed), correct_count, next_review_at
past_papers         user_id, subject_id, material_id, year, exam_type
tutor_threads       user_id, subject_id, material_id, title, mode (explain|socratic|exam)
tutor_messages      thread_id, user_id, role, content, citations jsonb
subject_ratings     user_id, subject_id, rating (Elo, starts at 1000), attempts_count;   (M11)
                    one per subject
attendance          user_id, subject_id, date, start_time (the routine class; null =    (M12)
                    added by hand), status (present|absent|cancelled); unique per
                    subject, date and start time
marks               user_id, subject_id, assessment, max_marks, obtained, date (M12)
semester_results    user_id, semester, sgpa (0–10), credits; one per semester (M12)

── Planning, tasks, focus ────────────────────────────────────────────────────
tasks               user_id, area (academics|hustle|life|personal), subject_id, hustle_id,
                    title, notes, due_at, est_minutes, priority 1–4,
                    status (todo|doing|done|skipped),
                    source (manual|text|screenshot|share|gmail|calendar|ai), source_ref,
                    completed_at
calendar_events     user_id, provider_event_id, title, start_at, end_at, is_fixed
plan_blocks         user_id, date, start_at, end_at, area,
                    kind (learn|review|practice|task|hustle|life|break|buffer|fixed),
                    topic_id, task_id, hustle_id, title, planned_minutes, actual_minutes,
                    status (planned|in_progress|done|partial|missed|moved), plan_version
focus_sessions      user_id, plan_block_id (null = a session on its own), area, subject_id,
                    hustle_id, mode (pomodoro|deep|custom), started_at, ended_at,
                    planned_minutes (of focus; the timer adds the breaks), actual_minutes
                    (focused: no breaks or pauses; pauses are kept on the device), outcome, completed
distraction_events  user_id, focus_session_id, at,
                    kind (self_report|blocked_open|tollbooth_unlock|tollbooth_failed|mode_switch),
                    app_package, reason, from_mode, to_mode, quiz_id (the tollbooth quiz),
                    unlock_until (tollbooth_unlock: blocked apps open until then)
blocked_apps        user_id, package_name, label, active
screen_time_daily   user_id, date, package_name, minutes                       (P2)

── Progress (P2) ─────────────────────────────────────────────────────────────
metric_snapshots    user_id, week_start, memory, learning_speed, processing_speed,        (M11)
                    problem_solving (null = too little practice), focus_minutes,
                    details jsonb; one per finished week with practice
challenges          user_id, week_start, metric, baseline, target, achieved (null      (M11)
                    until the week is over); one per week
weekly_reviews      user_id, week_start, stats jsonb, insights jsonb, changes jsonb       (M13)
                    (each change with its status: open|applied|skipped), source (ai|device),
                    model, prompt_version, completed_at; one per week

── Life (migration 007_life.sql, M14) ──────────────────────────────────────────
habits              user_id, title, kind (sleep|gym|meal|water|study|custom),
                    days_of_week smallint[], target + unit (counted habits, e.g. 8 glasses),
                    order_index, archived_at
habit_logs          habit_id, user_id, date, value, done; one per user, habit and day
workouts            user_id, date, title, program (hostel|dumbbell|gym|null), day_key,
                    exercises jsonb ([{ name, kind, sets: [{ reps, seconds, kg }] }]),
                    duration_min, notes
meals               user_id, eaten_at, meal (breakfast|lunch|snack|dinner), description,
                    calories, protein_g, carbs_g, fat_g (estimates), source (photo|preset|
                    manual); no photo column: photos are never stored
sleep_logs          user_id, date (the morning), bed_at, wake_at, minutes asleep,
                    source (manual|health_connect); one per day and source
step_counts         user_id, date, steps, source (manual|health_connect); one per day and
                    source
speaking_sessions   user_id, scenario (interview|presentation|group_discussion|small_talk),
                    prompt, duration_sec, transcript, words, wpm, filler_count, fillers jsonb,
                    scores jsonb (clarity, structure, vocabulary, confidence 1–10),
                    feedback jsonb ([{ kind: strength|tip, text }]), source (ai|device);
                    no audio column: recordings are never stored

── Hustle (P3) ───────────────────────────────────────────────────────────────
hustles             user_id, type (freelancing|content|startup|parttime|custom), name,
                    goal, goal_amount, goal_date, currency, pipeline_stages, status,
                    links jsonb ([{label, url}] for the Launchpad; migration 002)
hustle_phases       hustle_id, user_id, order_index, title, status, started_at, completed_at
hustle_steps        phase_id, user_id, title, done, skill_topic_id (skill bridge)
hustle_items        hustle_id, user_id, kind (order|content|experiment|session|other),
                    title, stage, client_id, amount, currency, due_at, url, data jsonb
clients             user_id, hustle_id, name, platform, contact, notes
transactions        user_id, hustle_id, client_id, kind (income|expense), amount, currency,
                    occurred_on, category, note,
                    source (manual|gmail|paypal|stripe|sms), source_ref
time_entries        user_id, hustle_id, started_at, ended_at, minutes, source (focus|manual)
                    (focus = hustle focus sessions, for a block or on their own, and 10-minute
                    Launchpad sessions)

── Social (migration 008_social.sql, M15) ──────────────────────────────────────
shared_stats        user_id (one row each), display_name, share_focus, share_streak,
                    share_plan, share_studying, on_leaderboard, week_start, focus_minutes,
                    streak_days, plan_pct, studying_until; checks make an unshared number
                    impossible to store, so partners and group mates may read the row
                    (is_connected); the app publishes it (SocialSync)
shared_stats_view   the same with studying_now worked out (security_invoker)
partner_invites     user_id, code (10 characters from a random UUID), expires_at (7 days)
partner_links       user_id, partner_id; one row each way, made by accept_partner_invite;
                    removing either removes both (trigger); at most 5 partners
study_groups        user_id (owner), name, invite_code; the owner becomes the first member
group_members       group_id, user_id, role (owner|member); joined through join_group
                    (at most 30); leave_group passes the group on (the last one out deletes it)
group_sessions      group focus: group_id, user_id (who started it), mode, minutes,
                    starts_at, ends_at
nudges              user_id (sender), to_user_id, kind (study|cheer|checkin), message,
                    seen_at; only to a partner or group mate, 3 a day to the same friend;
                    the receiver can change only seen_at
Functions (security definer): is_connected, is_group_member (used by the rules),
accept_partner_invite, join_group, leave_group. Realtime: shared_stats, nudges,
group_sessions, group_members and ai_anchors are in the supabase_realtime publication.

── System ────────────────────────────────────────────────────────────────────
integrations        user_id, provider, status, scopes, external_account, vault_secret_id,
                    connected_at, last_sync_at
jobs                user_id, type, payload jsonb, status (pending|running|done|failed),
                    attempts, run_after, error
ai_usage            user_id, feature, model, input_tokens, output_tokens, cost_usd
feedback            user_id, kind (bug|idea|other), message (≤ 4000), screen, path,      (P1, M10)
                    screenshot_path (images bucket: <user_id>/feedback/<id>.png), context jsonb
                    (app, build, viewport, browser, language, timezone),
                    status (new|seen|planned|fixed|closed). Students insert (status new),
                    read and delete their own; only the founder changes the status (dashboard)
```

**Storage:** private buckets `materials` and `images`; files open through short-lived signed URLs. The free plan has little storage (check current limits), so always keep the extracted text, keep very large files on the device or in Google Drive (P2), and never store lecture videos.

## 7. AI design

### 7.1 Model tiers
Model names change often, so the code only knows **tiers**; real model IDs live in env vars.

| Tier | Used for | Volume |
|---|---|---|
| **Smart** (top reasoning model) | Syllabus → topic tree, past-paper analysis, learn-anything outlines, weekly review, custom hustle plans | Low: a few calls per student per week |
| **Fast** (cheap model) | Lessons, quizzes, flashcards, task capture, OCR, tutor, grading, hints, morning brief | High |
| **Embedding** | Search inside materials (tutor, topic mapping) | High but very cheap |

**Starting suggestion for $10/month:** use one provider at first. Google's Gemini models fit well: a free tier for development, cheap fast models, and they read PDFs, images, audio and YouTube links directly. Keep the code provider-agnostic so the Smart tier can later switch to Claude, GPT or another top model. Check current models and prices before choosing.

**Data use:** some free tiers may use your prompts to improve the provider's models. Enable billing (paid tier) before friends upload their material, and read the provider's data terms.

### 7.2 Rules for every AI call
- Goes through `supabase/functions/_shared/ai.ts`, which picks the tier → checks the user's quota → calls the model → validates the JSON with Zod (one retry) → logs tokens and cost in `ai_usage`.
- Prompts live in `supabase/functions/_shared/prompts/` with a version number; generated rows store `prompt_version`.
- Every generated item keeps its source (page, timestamp or section).
- The AI never invents URLs. Links only come from APIs (e.g. YouTube search).
- Tone follows the mentor style; explanations match the student's year, level and language setting.

### 7.3 Pipelines

**a) Syllabus → topic tree (`ai-syllabus`, Smart)**
1. Get the text: PDF → extracted on the device; photo → OCR with the Fast tier.
2. The prompt includes program, year, exam date and past-paper stats (if any).
3. The AI returns units and topics (in the university's wording), split into learnable topics of 30–120 minutes, with minutes, difficulty, prerequisites, exam weight, and optional Skill-track topics.
4. The student edits and confirms → saved to `topics` and `topic_prereqs`.

```ts
const TopicTree = z.object({
  units: z.array(z.object({
    title: z.string(),
    topics: z.array(z.object({
      key: z.string(),                    // short id used for prerequisites
      title: z.string(),
      track: z.enum(["exam", "skill"]),
      estMinutes: z.number().int().min(15).max(240),
      difficulty: z.number().int().min(1).max(5),
      examWeight: z.number().min(0).max(1),
      prerequisites: z.array(z.string()), // keys of other topics
    })),
  })),
});
```

**b) Past papers → priorities (`ai-papers`, Smart)**
1. Text per page (device) or OCR for scanned pages.
2. The AI extracts each question: text, marks, type, year, and the matching topic key from the given topic list (or `unmatched`).
3. Code adds up per topic: `pyq_count`, `pyq_marks_share`, last year asked.
4. Priority (code, not AI), each part normalized 0–1 within the subject:
   `priority = 0.45 × examWeight + 0.35 × pastPaperScore + 0.20 × dependentsScore`
   (`dependentsScore` = how many other topics need this one).

**c) PDF processing (device + `worker`)**
1. Upload the file to the private `materials` bucket.
2. On the device, pdf.js extracts text per page → `material_pages`. Pages with almost no text get `needs_ocr = true`.
3. A job is queued. The `worker` (cron every minute) works for about 50 seconds per run, then stops; the next run continues:
   - OCR flagged pages with the Fast tier (monthly cap),
   - find sections (PDF outline → headings → AI on the table of contents),
   - chunk text (~800 tokens, 100 overlap) and embed,
   - link sections to topics (embedding similarity; Fast tier confirms unclear matches).
4. Lessons, quizzes and flashcards are **not** made here, only when the topic comes up in the plan.

**d) YouTube (`worker`)**
1. YouTube Data API: title, duration, chapters from the description.
2. Transcript: send the video link to a model that accepts YouTube URLs, in ~15-minute segments, asking for timestamped text and section titles (low media resolution to save cost). Check that your provider supports this.
3. Free fallback: the student pastes the transcript from YouTube's "Show transcript".
4. Then continue like PDFs (sections → chunks → topic links).

**e) Lessons, quizzes, flashcards (`ai-generate`, Fast)**
- Input: topic, best-matching chunks, exam pattern from past papers, student level and language.
- Output: lesson markdown with source refs; 3–5 check questions plus topic questions (mixed types, difficulty 1–5); 5–15 flashcards. Zod-validated; near-duplicates of existing questions skipped.
- Generated once per topic and cached. "Regenerate" is a manual button.

**f) Tutor (`ai-tutor`, Fast)**
1. Embed the question → top 6–8 chunks from the subject's materials (filtered by `user_id` and `subject_id`).
2. Weak matches → general answer labelled "Not from your material".
3. Citations like `[p. 42]` or `[12:30]`. Socratic and Exam modes swap the system prompt.
4. Long threads are summarized to keep prompts short.
5. The PDF side panel uses the same function with the current page as context.

**g) Task capture (`ai-capture`, Fast)**
- Input: text or image + current date, time and timezone + the subject list.
- Output: `[{ title, area, subjectKey (a listed subject or null), hustleKey (a listed hustle or null), lead (a possible job or client for that hustle: saved as a card on its board), dueAt (ISO 8601 with offset; 23:59 when only a day is given), estMinutes, priority, unsure: [fields it guessed] }]`.
- The `unsure` fields are highlighted in the confirm sheet. Nothing is saved without confirmation. Demo Mode reads typed tasks on the device with simple rules (screenshots need the AI).

**h) Grading (`ai-grade`, Fast; built in M11):** up to 15 written answers (short and long answers, programs and past-paper questions of a mock test) per request, each with its marks and, when known, key points or a model answer → marks in steps of 0.5, 2–4 sentences of feedback, the missing points and a full-marks answer. Zod checks one grade per answer and never more than its marks (one retry). Without key points the model decides what the marks need. The student's answer is never followed as an instruction. Without the AI (Demo Mode, or when it fails) the device gives a rough mark by matching key words with the key points or the model answer, and the student marks what it can't compare.

**i) Morning brief (`ai-brief`, Fast):** today's plan + deadlines + last check-in → 3 short lines, cached for the day.

**j) Custom hustle plan (`ai-hustle`, Smart):** the student's idea (+ the skill it needs most, the goal) → a name, 4–8 phases of 2–5 small steps (steps about learning a skill name it, for the Skill Bridge) and 3–6 pipeline columns. Shown for checking before anything is saved; without the AI (and in Demo Mode) the general Custom template is used.

**j) Weekly review (`ai-review`, Smart, P2; built in M13):** weekly stats → 3 insights + 3 changes in a format code can apply, e.g. `{ "type": "move_subject_to_window", "subjectId": "…", "window": "morning" }`. As built:
- The request holds the week's numbers (`src/features/review/weekStats.ts`), with subjects as short keys (s1, s2, …). It adds the settings in force now (so nothing already set is suggested) and this week's challenge.
- Sleep and workouts (added 2026-11-02, prompt `review-v2`):
  - `sleep` holds the week's nights (one per morning; a typed night wins over Health Connect's), average minutes, regularity and nights under 7 hours.
  - `sleep.vsStudy` covers the last 4 weeks: for nights of 7+ hours (`rested`) and shorter ones (`short`), the days, focus minutes a day and the answers given that day, with the share right. `workouts` counts the week's workouts.
  - Both are optional in the request, so older app versions still get reviews. No change type is about sleep: the prompt asks for one insight when it stands out, as a pattern rather than proof, never medical advice.
- The answer is 1–3 insights and up to 3 changes in a flat format: the type plus the fields it needs, the others null, and a reason.
- There are 11 types: `move_subject_to_window`, `shift_budget`, `set_buffer`, `set_review_cap`, `set_new_cards`, `set_block_length`, `set_peak_window`, `set_revision_days`, `block_apps_in_study`, `challenge_metric`, `set_skill_minutes`. Each has limits (`src/features/review/changes.ts`).
- Zod checks that each change is complete and names a subject of the right kind (one retry). The app then keeps only changes that do something and differ from each other (at most 3).
- Demo Mode, and any failure, use fixed rules on the device (`localReview.ts`).
- The review is saved once a week (`weekly_reviews`). Applying a change saves the setting, and the plan is made again by itself; or it saves a skill course's weekly minutes, or next week's challenge.

**k) Coding hints (`ai-hint`, Fast, P2):** problem + code + test results + hint level → one hint; no full solution before level 4.

**l) Learn anything (Smart outline + Fast lessons):** topic, level, goal → outline → topics saved like a syllabus → lessons generated without source material; P2 adds verified resources from the YouTube API.

**m) Meal estimate (`ai-meal`, Fast; built in M14):**
- A meal photo and/or the student's note (with the meal: breakfast, lunch, snack or dinner) → each food with its portion, estimated calories, protein, carbs and fat (whole numbers), a confidence (low, medium or high) and a short note on what was hard to tell.
- The app first shrinks the photo on the device (longest side 1280 px, JPEG; `shrinkPhoto` in `src/lib/files.ts`).
- The photo exists only in that request: `meals` has no photo column and nothing goes to Storage. The note is information, never instructions.
- The student checks and edits the estimate before anything is saved.
- Demo Mode gives a clearly marked sample from the mess and hostel quick-add list.

**n) Speaking feedback (`ai-speak`, Fast; built in M14):**
- A recording plus the kind of speech and the question → a word-for-word transcript, scores 1–10 (clarity, structure, vocabulary, confidence; rounded in the function), one strength and 1–3 tips.
- The recording comes from the browser's own MediaRecorder: WebM/Opus on Chrome and Android, Ogg on Firefox, MP4 on Safari (sent to Gemini as M4A). It is recorded at 32 kbit/s, so 3 minutes is about 0.7 MB. Gemini reads audio inline up to 20 MB, at 32 tokens a second.
- The transcript must keep every filler as spoken, because words per minute and filler words are counted in the app's code (`src/features/life/speaking/speech.ts`). Hesitations (um/uh), "basically", "actually", "literally", "matlab" and "yaar" always count. "like" counts only when it isn't a verb or a comparison, "you know" not in questions, and "I mean" not in "what I mean".
- The recording is never stored: only the transcript, the counts and the scores.
- Accents are never marked down, and the question is never followed as an instruction.
- Without the AI (Demo Mode, or by choice) the student types what they said, and the device counts and gives tips from the numbers.

### 7.4 Cost control
- **Lazy generation** (per topic, when needed): the biggest saving.
- Cache everything; never regenerate automatically.
- Fast tier for ~90% of calls; Smart tier only for planning and analysis.
- Free text extraction on the device; OCR only for scanned pages.
- Quotas per user: AI requests per day, OCR pages and video minutes per month. Start strict, loosen with real data.
- **Me → AI usage** (M10): each student sees their requests in the last 24 hours against the daily limit and this month's cost per AI function (read from their own `ai_usage` rows), next to the whole app's spend over 24 hours and this month (the `ai-usage` Edge Function, which adds it up with the secret key and makes no AI call). Spend per student: a SQL query in the Supabase dashboard (docs/4, step 9).
- Provider budget alerts usually **don't stop** spending. The app's own quota check is the real limit.

## 8. Planner algorithm (P1)

Pure TypeScript in `src/features/planner/`, run in the app, saved to `plan_blocks`. Easy to unit-test.

**Inputs:** routine blocks, calendar events, tasks, topics (remaining minutes, priority, prerequisites, target date), reviews due, area budgets, energy hours, preferences, `speedFactor`.

**Steps (14-day horizon)**
1. **Free slots:** each day from wake to sleep, minus fixed blocks (classes, meals, gym, commute, calendar events), minus a 10–15% buffer.
2. **Reviews:** time for flashcards and mistakes due (~10 s per card), in low-energy slots, max 30 min/day by default.
3. **Deadlines, earliest first:** task work before each due date, aiming to finish a day early. On the due day, a task due at a set time (e.g. 5 PM) is placed first, in the free time before then; if there's no room, as early as possible and flagged at risk. A due date without a time means 23:59; a task without an estimate gets 60 minutes.
4. **Roadmap topics:** per subject, `minutesPerDay = remainingMinutes ÷ daysUntilTarget`, where `target = examDate − revisionDays (default 10)` and `remainingMinutes = Σ estMinutes × speedFactor × (1 − progress)`. Pick by `priority × urgency`, respecting prerequisites. Topics with difficulty ≥ 4 go into peak-energy slots. A subject the student set to a part of the day (`planner.subjectWindows`, from the weekly review: morning 6–12, afternoon 12–17, evening 17–21, night 21–24) has its study blocks placed there first, before the peak slots (M13).
4b. **Skill courses** (`subjects.kind = 'skill_course'`, e.g. from the Hustle Skill Bridge): after the exam pace and caught-up work, each gets its `weekly_minutes_limit` (default 2 h) per Monday–Sunday week, minus what was studied that week already, at most about a third of it a day (at least one block, at most 50 minutes). Getting-ahead time never goes to them, so the limit holds. They pause in exam season like the rest of the skill track.
5. **Area budgets:** reserve hustle and life time according to the weekly budget. The general hustle time is named after (and linked to) the main hustle: the active one with the nearest goal date, else the oldest. Hustle tasks link to their own hustle. Focus sessions on linked blocks add `time_entries` (source `focus`) for that hustle.
6. **Block shaping:** 25–50 minute blocks with breaks; max 2 same-subject blocks in a row.
7. **Feasibility:** if a deadline or target can't be met → mark "at risk" and offer options (use buffer/weekend, skip optional skill topics, move a self-set date).

**Auto-recovery:** unfinished minutes go back to the pool → re-run steps 3–6 for the coming days, never adding more than +20% to a single day.

**Minimum day:** keep the highest-priority block (≤30 min) + reviews (≤15 min); the rest goes back to the pool. "I Crashed" can be undone the same day.

**Evening check-in:** shown from 8 PM (or once the day's last block has started). It ends the day: blocks that aren't marked count as missed, then the plan is made again from tomorrow. The **Burnout Guard** (30% less capacity when the 3 most recent check-ins of the last 7 days had energy ≤ 2) applies to the first day of a plan.

**Speed factor:** per subject, the median of (actual minutes to mastery ÷ estimated minutes) over recent topics, clamped 0.5–2.0, starting at 1.0.

**When it runs:** on app open if the plan is from an earlier day, after the evening check-in, when tasks/deadlines/routine change, or when the student taps "Re-plan".

**Two devices:** each plan has a `plan_version`; a device only saves a new plan if its version is the latest, otherwise it reloads first.

## 9. Learning metrics and adaptivity

**Mastery per topic (P1)**
`mastery = 0.6 × recent quiz accuracy (last 10 attempts, newer weigh more) + 0.4 × average FSRS retrievability of the topic's cards`. Mastered at ≥ 0.8.

**Four metrics (P2)**

| Metric | Calculation | Direction |
|---|---|---|
| Memory | Share of due reviews rated Good/Easy, plus accuracy on re-tests after ≥ 7 days | Aim for 85–90% |
| Learning speed | `estimated ÷ actual` minutes to reach mastery (1.0 = as expected) | Up |
| Processing speed | Median seconds per **correct** answer, per question type and difficulty, vs the student's own baseline | Down |
| Problem solving | First-try accuracy on unseen questions with difficulty ≥ 3, and code problems solved without hints, weighted by difficulty | Up |

**Exam readiness (P2):** `0.4 × coverage (priority-weighted share of exam topics learned) + 0.4 × priority-weighted mastery + 0.2 × latest mock-test score`.

**Adaptive difficulty (P2, Elo-style)**
- Student rating per subject `Rs` starts at 1000. Question rating `Rq` starts from difficulty: 1 → 800, 2 → 900, 3 → 1000, 4 → 1100, 5 → 1200.
- Expected success: `E = 1 / (1 + 10^((Rq − Rs) / 400))`.
- After an attempt (`result` = 1 or 0): `Rs += K × (result − E)` with K = 24 (16 after 50 attempts); `Rq −= 8 × (result − E)`.
- Next questions are chosen so that `E ≈ 0.7`.

**Weekly challenge (P2):** one metric at a time. Two weeks on target → target × 1.05–1.10. Two weeks missed → target × 0.95.

**As built in M11** (`src/features/practice/elo.ts`, `src/features/metrics/`, `src/features/mock/`; all pure and tested):
- Metrics need a minimum before they say anything (memory 5 reviews or re-tests, processing speed 5 timed right answers, problem solving 3 first tries); otherwise they are null ("not enough practice"). Processing speed is the median over all quick right answers (check quizzes, practice, and the mock-test questions the app marks); written answers don't count, and there are no per-type baselines yet. Learning speed uses the minutes of done or partly done study blocks up to the day the topic was first learned (`topics.learned_at`). Problem solving doesn't count code problems yet.
- Finished weeks with practice are saved once in `metric_snapshots` (8 weeks back); this week is worked out live.
- Practice sessions use the check questions (the ones with an answer key), 10 per session. Question ratings start from the difficulty and stay within 100–3000.
- Readiness: a subject without a mock test yet gets 0 for that part, and its card links to the mock test. Topics without any priority all count the same.
- Weekly challenge: the first target is 5% better than the last measured value (memory at most 90%). "Two weeks" means two weeks in a row at the same target, so a new target starts counting again; 10% harder when both weeks beat it by 10% or more. A week too thin to measure counts as missed. Each finished week is judged only after its snapshot is saved.
- Mock tests: the pattern is the median count of each question type and marks over the past papers (the biggest paper when they have nothing in common), timed at 1.8 minutes per mark. A half paper keeps the same mix. Lesson check questions fill the multiple-choice and numerical sections (the app marks them); past-paper questions fill the rest as written answers. Questions not used in recent mocks and important topics come first. Half marks or more counts as right; less goes to the mistake notebook.

## 10. Spaced repetition
- `ts-fsrs` with desired retention 0.90 (setting 0.80–0.95), 20 new cards/day (setting), and a daily review cap with a warning when reviews pile up.
- Card state in `flashcards.fsrs` (jsonb) plus `due_at` for fast queries; every review logged.
- Mistakes use a fixed ladder of 1 → 3 → 7 days; fixed after 3 correct answers on different days (one at each step). A wrong answer sends it back to 1 day and the count starts again.

## 11. Android app blocker: FocusGuard (P1)

A Capacitor plugin written in Kotlin in `android/app/src/main/java/app/ekagra/student/focusguard/` (registered in `MainActivity`), with a TypeScript wrapper in `src/lib/native/focusGuard.ts`. On the web the wrapper answers with a stand-in: nothing is blocked, and the app list holds example apps so the picker can be tried. Built in M9 (steps 4–6).

```ts
interface FocusGuardPlugin {
  checkPermissions(): Promise<{ usageAccess: boolean; overlay: boolean; notifications: boolean; batteryUnrestricted: boolean;
                                exactAlarms: boolean; manufacturer: string /* for the battery guide */ }>;
  openPermissionSettings(opts: { type: "usageAccess" | "overlay" | "notifications" | "battery" | "exactAlarms" | "appInfo" }): Promise<void>;
  listLaunchableApps(): Promise<{ apps: { packageName: string; label: string; iconBase64: string; alwaysAllowed: boolean }[] }>;
  start(opts: { blockedPackages: string[]; endsAt: number; title: string; emergencyUnlocksLeft: number }): Promise<void>; // also updates a running session
  stop(): Promise<void>;
  unlock(opts: { minutes: number }): Promise<{ unlockUntil: number }>;      // a passed Academic Tollbooth
  getStatus(): Promise<{ running: boolean; endsAt: number; unlockUntil: number }>;
  takeEvents(): Promise<{ events: { type: "blockedAppOpened" | "emergencyUnlock"; packageName: string; label: string; at: number }[] }>;
  scheduleReminder(opts: { id: string; at: number; title: string; body: string }): Promise<void>; // Launchpad "time's up"
  cancelReminder(opts: { id: string }): Promise<void>;
  // events (while the app runs): "blockedAppOpened", "emergencyUnlock"; they are also queued for takeEvents()
}
```

**How it works**
1. Permissions: **Usage access** (`PACKAGE_USAGE_STATS`, turned on by the user in Settings), **Display over other apps** (`SYSTEM_ALERT_WINDOW`), notifications (Android 13 asks first; after a "no", the settings screen), no battery limits, and "Alarms & reminders" (`SCHEDULE_EXACT_ALARM`, granted automatically on Android 12–13, asked on 14+) for exact reminders. The **Focus and app blocking** screen (`/me/focus`) explains each one and opens its settings screen; it checks again when the app comes back.
2. App list: a `<queries>` entry for launcher apps, not `QUERY_ALL_PACKAGES` (restricted by Google Play). This app, the dialer, messages, settings, the clock and maps are never blocked (`AppRules.kt`).
3. The web app decides what to block (`src/features/focus/guardPlan.ts`): the picked apps (`blocked_apps`) while a focus session runs, until its timer ends (pauses push the end back), and with `settings.focus.blockDuring = 'study_blocks'` during every Study block too. `FocusGuardSync` calls `start()` when that changes and `stop()` when there is nothing to block.
4. `start()` saves the session on the phone (`GuardStore`) and starts `FocusGuardService`, a foreground service (type `specialUse` on Android 14+, with its reason in the manifest) with a notification: "Focus: Normalization · 18 min left · 3 apps blocked".
5. Every second the service reads recent usage events to find the app in front (`FocusGuardState.kt`, pure and JUnit-tested, decides allow, block or end).
6. Blocked app in front → a full-screen window over it (`BlockerOverlay`) with the title, minutes left, **Back to study** (also the back button; opens `ekagra://focus`) and **Emergency unlock (Academic Tollbooth)** with the unlocks left today (opens `ekagra://focus/tollbooth?app=…&label=…`). The **Academic Tollbooth** replaces the reason + 5 minutes unlock: 3 rapid-fire questions from the current subject, then a reason; all right → `unlock()` opens blocked apps for `tollbooth.unlockMinutes` (3–5), at most `tollbooth.dailyLimit` a day.
7. Blocked apps opened (and unlocks asked for) are queued on the phone and announced to JavaScript, which saves them as `distraction_events` (`blocked_open`; the Tollbooth itself saves `tollbooth_unlock` or `tollbooth_failed`).
8. The service stops at `endsAt` or on `stop()`. Android restarts it if it closes it (`START_STICKY`), and a boot receiver restores it after a restart or an app update in the middle of a session.
9. Reminders (`Reminders.kt`): AlarmManager wakes a receiver that shows a notification, exact when "Alarms & reminders" is allowed. The Launchpad uses it for "time's up"; ending the launch cancels it.

**Real-world issues**
- Many brands (Xiaomi, Oppo, Vivo, Realme, OnePlus, Samsung…) kill background services. The setup screen has brand-specific steps for OnePlus, Realme/Oppo, Xiaomi/Redmi/POCO and Samsung (`src/features/focus/batteryGuide.ts`; dontkillmyapp.com has more) and asks to turn off battery optimization for the app.
- Test on Android 12–15+ and at least 3 phone brands.
- Google Play checks these permissions closely. For the beta, share the APK directly or through Firebase App Distribution. Before a Play Store release: clear permission explanations (the privacy page at `/privacy` explains each one, M10) and Play's declaration forms.
- An Accessibility Service detects apps faster, but Play has strict rules for it. Keep it as a later option.

## 12. Integrations

| Provider | What we get | How | Phase | Notes |
|---|---|---|---|---|
| Google sign-in | Login | Supabase Auth (Google) | P1 | In the Android app, open sign-in in the system browser and return by deep link (Google blocks sign-in inside WebViews), or use a native Google sign-in plugin |
| Google Calendar | Events as fixed blocks; optionally write study blocks | OAuth + Calendar API | P1 stretch / P2 | |
| Gmail | College/portal emails → tasks; freelance order and payment emails → hustle | OAuth, `gmail.readonly` | P2 / P3 | Restricted scope: fine for test users; a public launch needs Google's security review |
| Google Drive | Import PDFs | Google Picker + `drive.file` | P2 | The Picker avoids full Drive access |
| YouTube Data API | Video info, chapters, verified video links | API key | P1 | Free daily quota |
| YouTube Analytics | Channel stats for content hustles | OAuth | P3 | Own channel only |
| Instagram | Followers, reach, post stats | Instagram API with Instagram Login | P3 | Business/Creator accounts only; testers allowed in development mode |
| GitHub | Commits and activity | OAuth app | P3 | Coding streak, dev freelancing |
| Notion | Import tasks and pages | Notion OAuth integration | P3 | |
| PayPal / Stripe | Income transactions | Read APIs | P3 | |
| Bank/UPI SMS | Income and expenses from transaction messages | Android SMS permission | P3 optional | Direct APK only; the Play Store requires special approval |
| Upwork | Contracts and earnings | Upwork API | P3 | Needs API approval; use Gmail parsing meanwhile |
| Fiverr | Orders and earnings | No public API | P3 | Gmail parsing + manual entry |
| Health Connect | Sleep, steps, workouts | Health Connect plugin | P4 | Sleep and steps built in M14 (see below); workouts not read |
| College portal | Assignments | No API | P1 / P5 | Capture in P1; browser extension in P5. Never store portal passwords |

**Health Connect (built in M14):** the Kotlin plugin `HealthBridgePlugin.kt` (in `android/app/src/main/java/app/ekagra/student/health/`) wraps `androidx.health.connect:connect-client` 1.1.0. The web app uses it through `src/lib/native/healthBridge.ts`.
- **Android versions:** Health Connect exists from Android 9. The library asks for Android 8+, while the app still supports Android 7 (`tools:overrideLibrary` in the manifest). So every plugin method checks the version before touching `HealthReader.kt`, the only class that uses Health Connect.
- **Kotlin:** its suspend calls run with the standard library's `startCoroutine` (no coroutine library).
- **What it reads:**
  - Only `READ_SLEEP` and `READ_STEPS`. It never writes.
  - Sleep: sessions, with the awake stages left out. The app keeps one night per morning, the longest session, so naps are left out.
  - Steps: Health Connect's own daily totals (`aggregateGroupByPeriod`), so a phone and a watch aren't counted twice.
- **Syncing:** the last 30 days are read when Life → Sleep & steps opens or the student taps Sync. They are saved with `source = health_connect`, one row per day and source; a typed value wins over the synced one.
- **The manifest has:**
  - the two permissions;
  - a package query for the Health Connect app (Android 9–13);
  - the privacy links Health Connect requires before it shows its permission screen: `ACTION_SHOW_PERMISSIONS_RATIONALE` on MainActivity and the Android 14+ `VIEW_PERMISSION_USAGE` activity-alias. MainActivity opens `/privacy` for both.
- **Play Store:** publishing needs Google's Health Connect declaration form.

**Partners, groups and Realtime (built in M15):** `src/features/social/`.
- **What's shared:** the student starts sharing on Me → Partner and groups, and picks the numbers. The numbers are worked out on the device: focus minutes this week, the streak of days with 15+ focus minutes, and plan blocks done %. `SocialSync` publishes them every few minutes and as focus starts and ends ("studying until" = a running session's planned end).
- **Realtime:** one channel per student listens to `shared_stats`, their own `nudges`, `group_sessions` and `group_members`. Realtime applies the same rules, and a burst of changes reloads the affected views once.
- **Phone notifications:** nudges and a group mate's group focus give a notification only when the app is in the background on Android, through FocusGuard's reminder (no push service and no new library). Polling every minute is the fallback.
- **Demo Mode:** the student's own sharing row is kept on the device. The partner and the group are clearly marked samples, so codes say they need an account.

**Studio Bridge (built in M15):** `src/features/bridge/`, between Ekagra (App #1, http://localhost:5173) and Ekagra Studio (App #2, http://localhost:5174 or `VITE_STUDIO_URL`).
- **Payload, version 2 (`protocol.ts`):** an AI Anchor (id, material id and title, page, action, selected text, question, answer, topic). Long texts are cut to fit a link and marked `truncated`; the other app can read the whole anchor from Supabase by id. It is checked with Zod and encoded as base64url of UTF-8 JSON.
- **To Studio:** **Open in Ekagra Studio** opens `<VITE_STUDIO_URL>/?bridge_payload=<payload>` in a reused `ekagra-studio` tab. On Android it uses `ekagra-studio://anchor?bridge_payload=…`, falling back to the web version after 1.5 s when Studio's app isn't installed.
- **From Studio:** `?bridge_payload=…` on Ekagra's address is read by `launch.ts` before the router starts, so the app opens at the anchor's PDF page with the anchor shown. On Android it's `ekagra://anchor?bridge_payload=…`.
- **Same address:** `BroadcastChannel('ekagra_app2_studio_bridge_v2')` carries `upsert`, `delete` and `open` messages between tabs, for example Studio served at `/studio`. Each app uses one channel object, so it never hears itself.
- **Signed in:** Realtime on `ai_anchors` (the student's own rows) shows anchors saved in either app in the other at once.

**Google OAuth in the beta:** keep the consent screen in *Testing* (up to 100 test users, added by email). In testing mode, refresh tokens expire after 7 days, so users reconnect weekly. Fine for a beta; verify the app before a public launch.

**Tokens:** exchanged inside Edge Functions and stored in Supabase Vault. The app never sees them. Sync runs on a cron schedule.

## 13. Security and privacy
- RLS on every table. Test with two accounts: one must never see the other's data.
- Service role key and AI keys only in Edge Function secrets.
- Private storage buckets; signed URLs that expire.
- Uploaded books stay private to the uploader (copyright). Groups share notes and decks only.
- Never store college portal passwords.
- Blocker and usage data stay in the student's own account; explain permissions in plain words.
- **Privacy policy** (M10): a public page at `/privacy` (needed for Google OAuth and the Play Store): what is kept, Demo Mode, where data lives, how the AI uses it, every Android permission, the student's choices, how long data is kept. Linked from sign-in and Me. Keep it true when features change.
- **Me → Account and privacy** (M10):
  - *Export all data*: built on the device as one JSON file (the profile and every table in `supabase/functions/_shared/userTables.ts`, own rows only, a page at a time; Demo Mode exports the device's data). Files are listed by their storage path, not included. The web downloads it; the Android WebView can't, so the Kotlin `FileSaver` plugin (`android/.../files/FileSaverPlugin.kt`) opens Android's "Save to" screen (`ACTION_CREATE_DOCUMENT`), which needs no storage permission.
  - *Wipe my data* and *Delete my account* (type DELETE; the server checks it too) call `account-delete` (secret key). It deletes the student's files in both buckets first (through the Storage API; Supabase doesn't allow deleting storage rows with SQL), then either every table children-first plus a profile reset (`ai_usage` stays, so wiping can't reset the AI limits) or the auth user, which deletes every row through `on delete cascade`. A PGlite test checks the table list is complete, the order works and the cascade leaves nothing. Afterwards the device forgets caches, timers and the Launchpad and stops FocusGuard; deleting the account signs out.
  - Known gap: deleting an account also deletes its `ai_usage` rows, so the app's 24-hour spend counts less for the rest of that day.

## 14. Environments and workflow
- One Supabase project for now (free). Free projects pause after about a week without activity; daily beta use keeps it awake.
- Schema changes as SQL files in `supabase/migrations/`, applied with the Supabase CLI. Regenerate `src/types/database.ts` after each change.
- Git: commit after every working step; push to a private GitHub repo.
- Web: connect the repo to Netlify, Vercel or Cloudflare Pages (auto-deploy on push); every address must serve `index.html` (docs/4, step 7).
- Android: `npx cap sync` → a signed release APK from Android Studio → share it via Firebase App Distribution or a link (docs/4, step 8).
- Build size (M10): every page is a lazy route (loaded on first open, `src/router.tsx`), and `vite.config.ts` puts the libraries every screen needs into files of their own with Rolldown's `codeSplitting.groups` (Vite 8's replacement for `manualChunks`): react, router, supabase, query, radix. CodeMirror, pdf.js and Markdown stay with their screens; Pyodide comes from a CDN. No file is over 500 kB.
- Which build is running: Vite writes the build time into the app (`__APP_BUILD__`); Me and every feedback report show it.
- `.env` is never committed; `.env.example` lists the variable names.

## 15. Testing
- **Unit tests (Vitest):** planner, priority score, mastery, metrics, Elo, FSRS wrapper, date and timezone helpers.
- **RLS test:** a script that signs in as two users and checks they can't see each other's data.
- **Manual checklist** for each milestone (roadmap doc).
- **Real phones:** blocker and notifications on several brands.
