# Ekagra: Project Plan

> **Ekagra** (Sanskrit *ekāgra*: "one-pointed focus"). Android app ID `app.ekagra.student`.

An AI mentor app for college students. It turns your syllabus, books and lectures into a daily plan, teaches and tests you, blocks distracting apps while you focus, and in later phases manages your side hustle and your health in the same place.

**Core idea:** open the app → see the one thing to do now → start. The AI does the planning; the student does the work.

## Documents

| File | What's inside | Use it when |
|---|---|---|
| [docs/1-product-spec.md](docs/1-product-spec.md) | Every feature, screen and user flow, tagged by phase | Deciding **what** to build |
| [docs/2-technical-design.md](docs/2-technical-design.md) | Stack, architecture, database, AI pipelines, planner, app blocker, integrations | Deciding **how** to build it |
| [docs/3-roadmap-and-build-guide.md](docs/3-roadmap-and-build-guide.md) | **§0: the current 2-phase plan and milestone checklist**, building with AI tools, beta testing, costs, risks | Every week while building |
| [AGENTS.md](AGENTS.md) | Project rules that AI coding tools read automatically | Keep it in the project root |

## Key decisions

| Topic | Decision |
|---|---|
| First users | You + friends/classmates (about 5–20 students) |
| Platforms | Android app + installable web app from one codebase; Ekagra Studio is a second web app in the same repo (`studio/`) |
| Builder | First-year student; AI coding tools write most of the code |
| Stack | React + TypeScript + Vite, Capacitor for Android, Supabase backend |
| Budget | $10/month at the start; college funding later if the beta shows results |
| Plan | 2 phases: Phase 1 = a fully working app (milestones M1–M10, docs/3 §0); Phase 2 = everything else |
| College portal | No API → capture tasks by typing, screenshot, share or email |
| Distraction control | Block chosen apps during focus sessions (Android); emergency unlock only through the Academic Tollbooth (3 quick questions → 3 minutes) |
| AI features | All six: syllabus → roadmap, PDF/video → lessons and quizzes, AI tutor, coding practice, past-paper patterns, adaptive challenge |
| AI provider | Ekagra: Claude (Anthropic) only, Claude Sonnet 5.5 for Smart tasks and Claude Haiku 5.5 for Fast ones (since 2026-11-02; Gemini before). Ekagra Studio: Gemini, which reads YouTube links, through the same gateway and budget |
| Life section | Phase 1: routine blocks and the evening energy check-in; habits and the full section (gym, diet, sleep, communication) in Phase 2 |
| Side hustles | Phase 1 templates: freelancing, content creation, startup, part-time / tutoring, custom |
| Integrations | Google Calendar/Gmail/Drive, YouTube/Instagram, payments, GitHub/Notion, freelance platforms |
| Extra ideas | All seven: spaced repetition + mistake notebook, auto-recovery, exam season mode, weekly review, skill bridge, earnings per hour, accountability partner |
| Ekagra Studio | The study room (notes, mind maps, revision sheets, quizzes, practice), built from scratch in `studio/` (decided 2026-11-02; replaces the "Tools app"). Same login and database; Ekagra shows its notes and keeps managing plan, life and progress |

## Phases at a glance

1. **Phase 1, a fully working app:** sign-in and Android app; Today with the 14-day planner, "I Crashed" and the evening check-in; Academics (dual-track topic tree, past-paper priority, PDF viewer with AI Anchors and a page tutor, lessons, quizzes, flashcards, mistake notebook, Python Coding Lab); Hustle (templates, Kanban, clients, money, earnings per hour, Skill Bridge, AI capture); focus timers and FocusGuard with the Academic Tollbooth; for the friends beta: in-app feedback, AI usage, a privacy policy, data export and account deletion
2. **Phase 2, everything else:** the full AI tutor (chat threads, search across all materials), YouTube lectures, weekly review, learning metrics, mock tests, friends, the full Life section, integrations, exam season mode, the Tools app

Details and the milestone checklist: [docs/3 §0](docs/3-roadmap-and-build-guide.md).

## Name ideas

| Name | Meaning | Why it fits |
|---|---|---|
| **Ekagra** (chosen) | Sanskrit *ekāgra*: "one-pointed focus" | Names the exact problem the app solves |
| **Kairo** (top pick) | From Greek *kairos*: "the right moment" | Right task at the right time; easy to say anywhere |
| **Lakshya** (top pick) | Hindi/Sanskrit: "aim, target" | For ambitious students with big goals |
| Sankalp | Sanskrit: "firm resolve" | Commitment and discipline |
| Abhyas | Sanskrit/Hindi: "practice" | Learning by doing |
| DualPath | Two paths, one plan | Studies and side hustle together |
| Orbit | Everything circles one plan | Studies, hustle and health in sync |
| Focal | The focal point of your day | Short and focus-themed |
| Mentora | Your mentor | Says what it does |

Before publishing, check the Play Store, domains (.app, .in, .com) and Instagram/YouTube handles. Availability and trademarks were **not** checked.

## Decisions log

Add a dated line whenever an important decision is made or changed.

- 2026-10-31: Plan created. Stack changed from Expo to React + Capacitor because AI will write most of the code and the app is heavy on PDFs, quizzes and code editing (see technical design §2).
- 2026-11-01: Roadmap compressed to 2 phases ("Working App First", docs/3 §0). Hustle module and Python Coding Lab move into Phase 1. New: 1-click AI Anchors in the PDF viewer, and the Academic Tollbooth (3 rapid-fire questions → 3-minute unlock) replaces the reason-based emergency unlock. Hustle templates: freelancing, content, startup, custom.
- 2026-11-01: M1 done. The Phase 1 migration keeps only Phase 1 tables (AI tutor, pgvector search, calendar, habits and feedback tables move to a Phase 2 migration); signed-out visitors (`anon`) get no table access. Added PGlite (test-only) so `npm test` runs the real migration and checks RLS with two users. Kept oxlint from the scaffold for `npm run lint`.
- 2026-11-01: M2 done (code; linking Supabase and `db:push` are your one-time steps in docs/4). The app is named **Ekagra** (app ID `app.ekagra.student`, sign-in return link `ekagra://auth/callback`). **Demo Mode**: one tap, no account, works offline; data stays on the device behind the same repo interface as Supabase, so every screen works in both. `capacitor.config.json` instead of `.ts` (TypeScript 7 can't load a TS config for the Capacitor CLI). `src/types/database.ts` is hand-written until `npm run db:types` can run. The 001 migration also creates profiles for accounts made before it runs. The planner and priority engines moved into M2 so onboarding can show a real plan preview; study blocks keep their order in time and never come 3 of one subject in a row.
- 2026-11-01: M3 plan. M3 now takes in the old M5 (PDF + AI Anchors), M6 (learn loop) and M7 (Coding Lab), in 7 steps, with M4 (Today) right after. The tutor in Phase 1 is a page tutor ("Ask about this page", saved as `ai_anchors` with action `ask`), so no new migration; the full tutor with pgvector stays in Phase 2. AI: Google Gemini through the Vercel AI SDK v7 (`ai`, `@ai-sdk/google`, dev dependencies only: they run inside Edge Functions), Smart = `gemini-3.8-flash`, Fast = `gemini-3.5-flash-lite` (names and prices are secrets, easy to change). The monthly AI budget is enforced per 24 hours (1/30 of it), because Supabase's API can't add up `ai_usage.cost_usd` without a new database function. Pyodide loads from a CDN on first use instead of being bundled. Added `react-markdown` for AI answers. Demo Mode stores the M3 tables in `demoDb` (localStorage), checked against the real migration by a test. `src/types/database.ts` is now generated from the linked project (`npm run db:types`).
- 2026-11-01: M3 done, still no new migration. Edge Functions each have their own pinned `deno.json` and are checked with Deno (`npm run functions:check`); Deno lock files aren't committed. Phase 1 doesn't fill `material_pages`: the PDF viewer reads a page's text on the device and sends it to `ai-tutor`; Demo Mode keeps PDFs in IndexedDB. **Flashcards:** ts-fsrs 6 (FSRS-7) with learning steps 1 and 10 minutes, at most 365 days, 20 new cards a day; the FSRS library only loads for reviews; a review never counts as earlier than the card's last one (lagging clocks). **Mistakes:** back after 1 day; a right answer moves a mistake up (3, then 7 days), a wrong one sends it back to 1 day and the count starts again; fixed after 2 right answers on different days. A forgotten card (Again on a learned card, not while learning) and every wrong check-quiz answer create one. The plan's review block adds flashcards (~12 s) and mistakes (~45 s) and rounds to 5 minutes. **Coding Lab:** Pyodide 314.0.7 from the jsDelivr CDN in a module Web Worker (the npm `pyodide` package is a dev dependency, only for types and for tests that run real Python); runs stop after 10 seconds; code problems are `questions` with type `code` (tests = a Python call + expected value, `answer` = starter + model solution); 8 starter problems; `@codemirror/view` and `@codemirror/commands` are listed because the editor imports them (they come with `codemirror`). **Lessons:** `ai-generate` (Fast) makes the lesson, 3–5 check questions (mcq and numbers are checked, short answers are marked by the student; AI grading waits for `ai-grade`) and 5–15 flashcards in one call, only when the student taps "Make my lesson"; regenerating keeps the flashcards. Mastery = the last check-quiz score; from 80% the topic counts as learned (`review`) and leaves the plan. AI-made code problems are left for later (their tests can't be checked on the server yet).
- 2026-11-01: Mistakes are fixed after **3** right answers on different days instead of 2, so every mistake goes through the whole 1 → 3 → 7 day ladder (with 2, the 7-day step never happened). Only the app code and docs change: `ladder_step` still goes 0–2 and the 001 migration's comment is left as it was (applied migrations aren't edited). M4 plan: task capture (`ai-capture`, tasks, confirm sheet) moves from M8 into M4, next to the Today screen, the morning brief (`ai-brief`), "I Crashed" and the evening check-in.
- 2026-11-01: M4 done, still no new migration (Demo Mode stores `tasks`, `plan_blocks`, `daily_checkins`, `focus_sessions` and `distraction_events` too). **Saved plan:** 14 days in `plan_blocks`, made again from now (after the block that is running) or from tomorrow; only blocks still "planned" are replaced, earlier days' unmarked blocks become missed, and a plan is only saved if no other device saved a newer `plan_version` meanwhile. A **plan keeper** in the app shell re-plans when the app opens with a plan from an earlier day or when a fingerprint of the planner's inputs changes (settings, routine, exam dates, topics learned or not, priorities, prerequisites, open tasks, today's minimum day; not energy, because the evening check-in plans tomorrow itself); the last run is kept per device in localStorage. Work done comes off the estimates, but unfinished work keeps at least 30 minutes, and a subject studied today counts toward today's pace. **Now card:** Start Focus is a simple timer saved to `focus_sessions` (Pomodoro, Deep Work and app blocking stay in M9); Done and Partly count the minutes focused (at most 1 hour over the plan), Skip marks the block missed, and the first work on a topic moves it to "learning". The **Mode Chip** and the switch warning follow `plan_blocks`; confirmed switches go to `distraction_events`; the Mode Simulator is gone. **Tasks:** a floating + on every screen (not on the PDF viewer, code editor and review screen); Demo Mode reads typed tasks on the device, `ai-capture` (Fast) reads text and screenshots; guessed fields are highlighted in the confirm sheet; a due date without a time means 23:59, a task without an estimate gets 60 minutes, and on its due day a task due at a set time is planned before that time. **I Crashed** sets `minimum_day` for today and can be undone. The **evening check-in** shows from 8 PM (or once the day's last block has started) and ends the day: unmarked blocks count as missed, so no work is planned twice, then tomorrow is planned; the Burnout Guard (−30%) applies to the first day of a plan. **Morning brief:** `ai-brief` (Fast) when signed in, made on the device by fixed rules in Demo Mode or when the AI isn't available; it waits until the day's plan is up to date and is kept on the device for the day (Refresh writes a new one).
- 2026-11-01: M8 plan (7 steps, docs/3 §0). Part-time / tutoring gets its own template again (the spec's 5 types), so migration `002_hustle_mode.sql` adds `parttime` to `hustles.type`; it also adds `hustles.links` (a list of `{label, url}`) for the Launchpad, so M8 needs only one `db:push`. `src/types/database.ts` got the `links` column by hand, in the generator's format (`db:types` after `db:push` gives the same). A newer migration missing on the server now shows "The database needs the latest update". Template steps that need a skill keep it in `hustle_steps.skill_name` (for the Skill Bridge); "{skill}" in a template is the skill the student names when starting. Added shadcn's Checkbox (from the `radix-ui` package already installed; no new dependency).
- 2026-11-01: M8 done. **Custom hustles** are planned by `ai-hustle` (Smart) and shown for checking first; Demo Mode and AI failures use the general Custom template (the reason is shown). **Board:** cards move with arrow buttons (no drag-and-drop library; works on touch), saving only the moved card halfway between its neighbours (1 and 2 → 1.5); the column is numbered 1, 2, 3 again only when a gap gets below 0.000001. Moving a card with a price into "Paid" offers to log the payment once. **Money and time:** net profit = income − expenses (rounded to paise); earnings per hour = net profit ÷ logged hours, worked out in the app (so it also works per client, per month and in Demo Mode) and checked against the `hustle_earnings` view by a PGlite test. Manual time is dated at noon local time. Time is only what was tracked (focus sessions on hustle blocks, Launchpad sessions, manual entries): marking a block done doesn't add hours. **Planner:** general hustle time is named after and linked to the main hustle (active, nearest goal date, else the oldest); hustle tasks link to their hustle; skill courses get their weekly minutes after the exam pace (about a third a day, in blocks of 15–50 minutes, never over the limit: getting-ahead time skips them; paused in exam season). **Skill Bridge:** "Learn this" reuses a skill course with the same name (and its next open topic) instead of making duplicates, or links an existing skill-track topic. **Capture:** hustle tasks that name no hustle go to the main hustle, marked to check; leads become cards in the first column. **Launchpad:** 10 minutes with a goal, kept on the device (survives app switching); "Yes" logs the time it ran (1–15 minutes); there's no phone notification when the time is up (that needs a Capacitor plugin, to be approved first), so the app asks when you come back.
- 2026-11-01: M9 done (no migration). **Timer:** a session stores its mode and planned minutes of focus; the schedule is rebuilt from `settings.focus` (Pomodoro 25/5, Deep work 50/10), and pauses are kept on the device (`ekagra-focus`). Minutes focused leave out breaks and pauses and stop at the planned focus; they become the block's `actual_minutes` and, for hustle sessions, `time_entries`. One-tap Start focus uses `settings.focus.defaultMode` fitted to the block's time left (a last stretch under 10 minutes is skipped). The plan fingerprint now holds only the planner's settings, so focus and Tollbooth settings don't re-plan. Focus screen at `/today/focus` (Today stays highlighted), a focus bar on other screens, a Web Audio chime when a phase ends. **Idle guard:** study sessions only; 4 minutes of focus time without a tap, click, scroll or key press pauses the session, placed where the 4 minutes ran out (also after the app was closed); idle pauses stay on the device, as the database has no kind for them. **Tollbooth:** the events use the database's kinds `tollbooth_unlock` / `tollbooth_failed` (not `emergency_unlock`), so no migration; questions are the subject's MCQs and numericals, its flashcards as 4-choice questions (wrong choices are other cards' answers), then built-in mental maths; 20 seconds each, the reason comes after all are right, a wrong try waits 60 s and leaving in the middle counts as wrong; attempts are saved only for real questions. **FocusGuard:** Kotlin (Kotlin Gradle plugin 2.2.21, JVM 21); §11 gained `unlock`, `getStatus`, `takeEvents`, `scheduleReminder`/`cancelReminder`, `manufacturer`, `exactAlarms`, `alwaysAllowed` and the `appInfo`/`exactAlarms` screens. Its events are queued on the phone so none are lost while the app is closed; the blocker opens the app with `ekagra://focus` links. **Launchpad reminder:** through FocusGuard's AlarmManager reminder (no npm plugin), exact when "Alarms & reminders" is allowed (`SCHEDULE_EXACT_ALARM`). Native decisions are JUnit-tested; behaviour on phones is tested by hand (docs/4, step 5).
- 2026-11-01: M10 done, Phase 1 complete. In-app feedback moved from Phase 2 into M10; one migration, `003_beta.sql`. **Feedback:** bug, idea or other, the message (up to 4,000 characters), the screen's name (from the address, can be changed), an optional screenshot and device details (web or Android, build time, screen size, browser, language, timezone). The screenshot is a picture the student attaches (Power + Volume down first), because capturing the screen in the app would need html2canvas (not approved); it goes to the private `images` bucket at `<user_id>/feedback/<id>.<ext>` (PNG, JPG or WebP, up to 10 MB). Statuses `new`, `seen`, `planned`, `fixed`, `closed` are set only by the founder in the dashboard: students can add (always `new`), read and delete their own rows, with no update rule and no delete button (Wipe my data covers it). Demo Mode keeps feedback on the device with **Copy text**. Vite writes the build time into the app (`__APP_BUILD__`), shown on Me and in every report. **AI usage:** the new `ai-usage` Edge Function makes no AI call and isn't counted; it reads the limits with the gateway's defaults even before the AI key is set, and adds up the whole app's spend over 24 hours and since the student's month began (secret key, up to 50,000 rows). The student's own numbers come from their own `ai_usage` rows (RLS) over the same rolling 24 hours as the quota; `anchor` and `tutor` both count as `ai-tutor`, and all 7 AI functions are listed, `ai-papers` included. Without the function the card shows the default limits. Shared server code was split so functions without AI don't load the AI SDK (`_shared/respond.ts`, `_shared/admin.ts`). **Privacy:** a public `/privacy` page in plain words (contact from the optional `VITE_CONTACT_EMAIL`, otherwise the feedback button); it isn't legal advice, so have it checked before the Play Store. **Export:** one JSON file made on the device (the profile and every table in `_shared/userTables.ts`, own rows only); files are listed by their storage path, not included. On Android the Kotlin `FileSaver` plugin saves it through Android's "Save to" screen (no npm plugin: `@capacitor/filesystem` and `@capacitor/share` aren't approved). **Wipe and delete:** `account-delete` (secret key) removes the student's files first (Storage API), then either every table children-first and a profile reset (name and photo stay; `ai_usage` stays so wiping can't reset the AI limits) or the auth user (all rows go through `on delete cascade`). The student types DELETE (the server checks it too); afterwards the device forgets caches, timers and the Launchpad and stops FocusGuard, and deleting the account signs out with a one-time message. Demo Mode's Reset moved to the same page. Known gap: a deleted account's `ai_usage` rows go too, so the app's 24-hour spend counts less for the rest of that day. **Code-splitting:** every page is a lazy route with a loading screen; React, the router, Supabase, TanStack Query and Radix get chunks of their own through Rolldown's `codeSplitting.groups` (Vite 8's replacement for `manualChunks`, which is deprecated there). The first download went from 536 kB to 154 kB, and the largest file (the code editor) is 471 kB. **Deploy:** docs/4 steps 7–9 (web host with every address answering `index.html`, a signed release APK with a kept key, reading feedback and AI spend); `*.jks` and release builds are ignored by Git.
- 2026-11-01: Phase 2 plan (docs/3 §0): M12 attendance and grades first (useful in the middle of a semester), then M11 adaptive practice and metrics, M13 weekly review, M14 full Life, M15 partner, groups and the Studio Bridge. Migrations are numbered in the order they're applied (M12 = 004, M11 = 005, …). Approved: Health Connect through `androidx.health.connect:connect-client` in a Kotlin plugin; the microphone and sending speech to Gemini (`ai-speak`, keeping only the transcript and scores, with Hinglish filler words such as "matlab"); meal photos analysed by `ai-meal` and not stored; hand-drawn SVG charts (no chart library); partner nudges in the app and as local notifications (no push service yet); the Studio Bridge to App #2 (`ekagra-studio`, its own Vite app) through `BroadcastChannel` for same-origin `/studio` tabs, Supabase Realtime on `ai_anchors`, and link or deep-link handoff (`?bridge=<payload>`, `ekagra-studio://anchor`); attendance minimum 75%, the 10-point grade scale (O = 10, A+ = 9, A = 8, B+ = 7, B = 6, C = 5, P = 4, F = 0) and credit-weighted SGPA/CGPA, all editable.
- 2026-11-02: M12 done (migration `004_attendance_grades.sql`). **Attendance:** a class block in the routine can name its subject (`routine_blocks.subject_id`; skill courses aren't offered), and Today asks about those classes. A row is one class; classes from the routine are found by subject, date and start time (unique), because the routine editor replaces routine rows (new ids) on every save. Classes added by hand have no start time. Cancelled classes don't count. The maths is pure and tested: safe bunks ⌊A/r − T⌋, classes to recover ⌈(rT − A)/(1 − r)⌉, and with the last day of classes (`settings.attendance.classesEndOn`) the classes left from the timetable and ⌊A + R − r(T + R)⌋ that can still be missed; holidays aren't known, so it's an estimate. "Close to the minimum" means at most one more miss. Percentages are rounded down, so 74.96% never shows as 75%. **Grades:** credits and a grade per subject (`subjects.credits`, `subjects.grade`), marks per assessment, earlier semesters typed in (`semester_results`, one per semester). SGPA counts subjects with credits and a grade; CGPA is credit-weighted, and results typed in for the current semester (from the profile) or later aren't counted twice. The scale (letters, points, % cut-offs O 90, A+ 80, A 70, B+ 60, B 50, C 45, P 40) lives in `settings.grades.scale`, can be edited, and falls back to the 10-point scale if it's broken; the cut-offs only suggest a grade from marks. `/onboarding?step=routine` opens the routine directly.
- 2026-11-02: M11 done (migration `005_adaptive.sql`, Edge Function `ai-grade`, now 10 functions). **Practice:** Elo per docs/2 §9 (question ratings from difficulty, kept within 100–3000), 10 check questions per session picked closest to 70% success (this session's skipped, the last day's and week's later), sessions saved as `quizzes.kind = 'subject'`. **Metrics:** the column is `topics.learned_at` (not `mastered_at`), set the first time a check quiz reaches 80%. Each metric needs a minimum amount of practice (else "not enough practice"). Processing speed only counts quick answers (written answers' time is kept in the answer, not `time_ms`). Finished weeks with practice are saved once in `metric_snapshots`. **ai-grade:** Fast tier, up to 15 answers per request, marks in steps of 0.5, never above the item's marks (Zod, one retry). Demo Mode and failures mark on the device by key words (null when there's nothing to compare, so the student marks it). **Mock tests:** pattern = median counts per question type and marks over the past papers, 1.8 minutes per mark, full or half paper. Check questions fill multiple-choice and numerical sections. The rest are past-paper questions marked as written answers. Fresh questions and important topics come first. The test in progress stays on the device (`ekagra-mock:<owner>:<subject>`, cleared on wipe) and is handed in at the deadline even after the app was closed. Written marks can be changed before saving; saving is safe to retry; half marks or more counts as right; under half goes to the mistake notebook. **Readiness:** no mock yet counts as 0 (the card says so). **Weekly challenge:** settled and set inside the weekly metrics sync (never judged before its week is saved). The first target is 5% better than the last value (memory at most 90%). Two weeks in a row at the same target make it harder (5%, or 10% when both beat it by 10%); two misses make it 5% easier; an unmeasurable week counts as missed. **Charts:** hand-drawn SVG that measures its own width (`ResizeObserver`), so text stays 11 px everywhere.
- 2026-11-02: M11 choices confirmed: no mock yet counts as 0 in readiness; ≥ 50% of a question's marks counts as right and less goes to the mistake notebook; mock tests don't change practice ratings or mastery; writing time doesn't count for processing speed; the memory challenge target stops at 90% and "two weeks" means two in a row at the same target.
- 2026-11-02: M13 done (migration `006_weekly_review.sql`, Edge Function `ai-review`, Smart tier, now 11 functions). **The week:**
  - With the usual Sunday, the review covers Monday–Sunday and is ready from Sunday. Until the next Sunday, last week's review waits.
  - A Monday review day looks back at the week that just ended.
  - The numbers come from plan blocks (moved ones once), answers (accuracy by part of the day over 4 weeks: morning 6–12, afternoon 12–17, evening 17–21, night 21–24), flashcard reviews, focus sessions, distractions (top apps and hours, mode-switch reasons), check-ins, tasks, hustle time and income, and the 4 metrics.

  **Changes:**
  - A fixed list of 11, each with limits and a check: is it already set, does the subject still exist, is there a baseline? The AI may only pick from it, in a flat JSON format with subject keys, and the app keeps at most 3 usable ones.
  - Settings-type changes are saved in `profiles.settings`, and the plan fingerprint re-plans by itself.
  - New planner settings: `planner.subjectWindows` (a subject's study blocks go to its part of the day first, before the peak hours) and `planner.maxBlockMinutes`.
  - Next week's challenge is written directly as next week's `challenges` row. An open one is changed; a settled one stays.

  **Without AI:**
  - Demo Mode and failures use fixed rules (`localReview.ts`): blocks finished, accuracy by part of the day, retention, distractions, energy, an exam 15–30 days away, time against the budget, overdue tasks, topics learned, next week's challenge.

  **Making and reminders:**
  - The review is made only when the student taps (one Smart call a week) and saved once per week; making it again replaces it.
  - "Ask the AI again" appears only when the device wrote it.
  - Reminders: a Today card on the review day and the day after, until the review is done. On Android, a notification at 18:00 through FocusGuard's existing `scheduleReminder` (no new library), skipped when that week's review is done.
  - New settings `review { day, reminder }`.
- 2026-11-02: M14 done (migration `007_life.sql`, Edge Functions `ai-meal` and `ai-speak`, Fast tier, now 13 functions; Health Connect plugin). **Tables:**
  - `habit_logs` is unique per user, habit and day. A global unique rule would let another user's insert hit "duplicate key" before the ownership check, which leaks whether a habit had a log.
  - Habits use `days_of_week smallint[]` instead of a schedule JSON. There is a new `step_counts` table.
  - `meals` has no photo column and `speaking_sessions` no audio column: photos and recordings are never stored.

  **Habits and workouts:**
  - Streaks count the scheduled days done in a row. Days off don't break them, and today only breaks them once it's over.
  - Workouts use three fixed programs (hostel room, dumbbells, gym push/pull/legs) as a rotation of days, with no AI. Settings `life { program, workoutDays, calories, protein, stepGoal }`.

  **Meals:**
  - The phone shrinks the photo to 1280 px JPEG (`shrinkPhoto`) and sends it in the request only. The student checks the estimate before saving.
  - 24 mess and hostel quick adds. Demo Mode gives a sample that's clearly marked.

  **Speaking:**
  - The browser's own MediaRecorder at 32 kbit/s (no library); the recording stops by itself at 3 minutes. Gemini reads WebM/Ogg/M4A inline.
  - The AI only writes the transcript (fillers kept), the scores and the tips. Words per minute and fillers are counted in code with simple rules ("like" isn't counted after "I", "looks" or "was"; "you know" isn't counted in questions).
  - Typing what you said works everywhere (Demo Mode too).

  **Health Connect:**
  - `connect-client` 1.1.0 (minSdk 26) with `tools:overrideLibrary`, so the app keeps minSdk 24. The plugin checks for Android 9+ before loading the one class that uses Health Connect.
  - Suspend calls run with the standard library's `startCoroutine`. Reading only sleep and steps; steps are Health Connect's daily totals, so there's no double counting.
  - One night per morning: the longest session, so naps are left out. A typed value wins over a synced one for that day.
  - Regularity is 0–100, from the standard deviation of bed times (measured from noon) and wake times; it reaches 0 at 2 hours.
  - The privacy links Health Connect requires open `/privacy` (MainActivity).

  **Not done yet:** sleep in the weekly review. The Life tabs load on demand.
- 2026-11-02: M15 done (migration `008_social.sql`). **Sharing:**
  - One `shared_stats` row per student, holding their choices and the published numbers. Check constraints make an unshared number impossible to store, so the table itself can be readable by partners and group mates (`is_connected`).
  - `shared_stats_view` is `security_invoker` and only works out "studying now".
  - The numbers are computed on the device and published by `SocialSync`, rather than computed in SQL (timezones, streaks).
  - Sharing starts only when the student taps Start sharing.

  **Joining:**
  - Partner and group codes are checked by `security definer` functions (`accept_partner_invite`, `join_group`, `leave_group`), because students can't read others' codes.
  - Partners are two mirrored rows, and a trigger removes the mirror; only a link both ways counts.
  - The owner leaving passes the group to the earliest member.
  - Every social table has `user_id` (sender or owner), so wipe and export cover it; groups you made go with your data.

  **Nudges:** 3 a day per friend (a trigger); the receiver can change only `seen_at` (a column grant).

  **Realtime:**
  - Postgres changes on `shared_stats`, own `nudges`, `group_sessions` and `group_members`; a burst of changes reloads once.
  - Android notifications only when the app is in the background, through FocusGuard's reminder (no push service, no new library); polling every minute stays as the fallback.

  **Group focus:** joining starts the student's own focus session for the minutes left.

  **Demo Mode:** a sample partner and group, clearly marked; the student's own sharing is real.

  **Studio Bridge:**
  - Names as asked: `?bridge_payload=<base64url JSON>`, replacing the earlier `?bridge=`. Also `BroadcastChannel('ekagra_app2_studio_bridge_v2')`, `ekagra-studio://anchor` (and back `ekagra://anchor`), and `VITE_STUDIO_URL` (default http://localhost:5174), which is documented in docs/4 only, not in `.env.example`.
  - The payload is version 2, checked with Zod; long texts are cut to fit a link.
  - An incoming link is turned into the anchor's address before the router starts (`launch.ts`). Otherwise the index redirect to /today wins the race.
  - Realtime on `ai_anchors` syncs anchors between the two apps when both are signed in to the same account.
- 2026-11-02: Sleep in the weekly review, the last item left from M14 (no migration; `ai-review` prompt `review-v2`). **The numbers** (`weekStats.ts`):
  - The week's nights, one per morning (a typed night wins over Health Connect's, as in Life → Sleep & steps). From them: average minutes, regularity (0–100, from 3 nights) and nights under 7 hours (`RESTED_MINUTES`, the low end of 7–9). Workouts logged that week count too.
  - Sleep vs study uses the same last 4 weeks as accuracy by part of the day. Each night is rested (7+ hours) or short, and the day it ended gets that day's focus minutes and answers. Focus sessions are now loaded for 4 weeks too.
  - Reviews saved before this read as having no sleep.

  **Insights, not changes:** no change type is about sleep (the 11 stay), so sleep only shows up in the insights.
  - Rules on the device need at least 3 days after each kind of night, and speak only when rested nights went better: 10+ points more answers right (8+ answers each), or else 20+ more minutes of focus a day. Then one note about the week: under 7 hours on average, or irregular times (under 60), or praise for 7+ hours at regular times (80+).
  - `ai-review` gets `sleep` and `workouts`, optional in the request so older app versions still work. The prompt asks for one sleep insight when it stands out, as a pattern rather than proof, never medical advice.

  **Screen:** a "Sleep and study" card under the week in numbers (with a link to Life → Sleep & steps when no nights were logged), and a Workouts tile when there were any. Phase 4's "Burnout guard; sleep vs study results" is ticked (the Burnout Guard came in M4).
- 2026-11-02: `ai-speak` gets text, never sound (prompt `speak-v2`), so any text-only model works, Claude included. **The words:**
  - The recording stays on the phone, only for playback.
  - Signed in, the browser's speech-to-text (Web Speech API, `en-IN`, no library) writes the words while the student speaks. It restarts after the browser's pauses; any error, or a browser without it (Firefox, most Android WebViews), means typing instead.
  - Demo Mode never uses it, because Chrome sends the sound to Google's speech service and Demo Mode promises nothing leaves the device.
  - The student checks the words in one box (typed answers use the same box), then picks **Get feedback** (AI) or **Count my pace and fillers** (device).

  **The request:** the words (`captured: 'speech' | 'typed'`), the length, and the pace and fillers counted on the device. The prompt says the model can't hear the voice, that speech-to-text drops um/uh and mishears words (never marked down), and never to comment on accent. The privacy page says so too.
- 2026-11-02: This repo uses **Claude only** (Anthropic), through `@ai-sdk/anthropic` 4.0.94 (approved), which replaces `@ai-sdk/google`. `AI_PROVIDER` takes only `anthropic`, and only the API key must be set. **Models:**
  - Smart = `claude-sonnet-5-5` ($2/$10 per million tokens), Fast = `claude-haiku-5-5` ($0.10/$0.50).
  - Not the 4.5 models: `claude-sonnet-4-5` retires on 30 November 2026, and Haiku 5.5 costs a tenth of Haiku 4.5.
  - A model name that isn't Claude is a setup error that names the secret.
  - Prices of the current models are built in (`KNOWN_PRICES`, with Haiku 5.5's higher price for prompts over 100,000 tokens). Each try is priced on its own; other models need `AI_PRICE_*`.

  **Thinking:** `AI_REASONING_SMART=low` and `AI_REASONING_FAST=none` (the AI SDK's `reasoning`). Sonnet 5.5 would otherwise think at high effort by default: slower, and paid as output. Answers can be up to 32,000 tokens.

  **Answers:**
  - They come as Anthropic structured output. The provider drops what Anthropic refuses (min/max, lengths, item counts) and Zod still checks them.
  - `anthropic.test.ts` runs the real provider without a network: images go as `image` blocks, PDFs as `document` blocks, speaking as text only, and every answer shape fits (no refused keywords; at most 16 nullable and 10 optional fields).

  **Errors:**
  - A refused key (401/403) says to check `AI_API_KEY`.
  - Busy or limits (429, 529, and the 400 for a Console spend limit, also after the SDK's own retries) say "busy or has reached its spending limit".
  - Only the status and Anthropic's message are logged, never the prompt.

  **Privacy:** the Privacy and Account pages name Anthropic's Claude and its Commercial Terms (no training on API data by default).
- 2026-11-02: **Two apps on one database** (roadmap §0, "Two apps"). Ekagra manages the plan, life, hustle and progress. **Ekagra Studio** is the study room: App #2, a new Vite app in `studio/`, built from scratch (the earlier prototype in `ai_system/ekagra-studio` is not used). **How they connect:**
  - One Supabase project. Ekagra's `supabase/migrations` own every table, Studio's too. Studio runs at its own address, so the student signs in there separately with the same Google account; then both apps see the same rows. Demo Mode can't connect them.
  - Each kind of data has one owner. Studio makes notes, mind maps, revision sheets, quizzes and practice. Ekagra shows the notes read-only and keeps its learning screens until Studio replaces them.
  - Studio's AI is Gemini, which reads a public YouTube link directly (no scraping), through the shared gateway and the same `ai_usage` budget. Ekagra stays Claude only.
  - Desktop: installable web apps first, then a Tauri `.exe` (a few MB instead of Electron's 100+, and later it can block apps on the laptop).

  **Notes (migration `009_studio.sql`, M16 step 1):**
  - One `notes` table for notes, mind maps and revision sheets. A note needs a subject and is deleted with it; its topic and material links are cleared when those are deleted. `status` is `processing`, `ready` or `failed`, for notes made in the background.
  - Ekagra lists only ready notes, without their text. Because Studio changes them from another app, these queries look again when the student comes back to Ekagra (10-second stale time; the app's default is no refetch on focus), and an open note that is still processing is checked every 15 seconds.
  - A mind map is a Markdown outline, drawn as a centre with a card per branch (`parseOutline`, pure and tested). Studio's prompts will avoid tables and LaTeX, which the Markdown reader doesn't render (no new libraries).
  - "Open Studio" and "Edit in Studio" open `studioPageUrl(VITE_STUDIO_URL, 'subjects/<id>' | 'notes/<id>')`, in the browser on Android.
  - Deleting a subject in Ekagra deletes its Studio notes too; the delete dialog and the privacy page say so.
- 2026-11-02: **Installable web app and desktop layout** (M16 step 2, no new library). **The app:**
  - `manifest.webmanifest` and a new icon: a white ring and dot ("one-pointed focus", what *ekagra* means) on the Academics blue. It replaces Vite's logo as the favicon; the PNGs (192, 512, maskable 512, Apple 180) were drawn with Windows' System.Drawing from the same shapes. The Android launcher icon is still Capacitor's default.
  - A hand-written service worker instead of Workbox or `vite-plugin-pwa`. It runs only in web production builds (`src/lib/pwa.ts`), so development and the Android app never see a cache.
  - Pages are network first, falling back to the saved `index.html`, also on a 5xx answer (found in testing: the in-app browser's proxy answers 502 when the server is down). Built files are saved on first load and read with `ignoreVary` (also found in testing: hosts add `Vary: Origin`, and module scripts send an `Origin` header that the saved copies lack, so nothing matched offline).
  - Only files already opened are saved, not every page of the app, to spare mobile data. Each build gets its own cache through `/sw.js?v=<__APP_BUILD__>`; there's no `skipWaiting`, so open windows keep their files until they close.
  - Tested on a production build: installed, then reloaded with the server stopped, and the app opened from the saved copy.

  **Desktop:** at 1024 px (`lg`) a side menu (`SideNav`, the same `TABS` as the bottom bar) replaces the bottom tabs, the top bar spans the window, pages widen from `max-w-2xl` to `max-w-4xl`, and the + button moves to the corner. The two places that stretch to the page edges (the mock test bar and the pipeline board) follow the wider padding.
- 2026-11-02: **The Add inbox** (M16 step 3, Edge Function `ai-inbox`, Fast, prompt `inbox-v1`; now 14 functions). M16 is done. **How it works:**
  - **Add** in the top bar, **Add a file** on Academics, or a file dropped anywhere on the window opens one sheet: choose a file, take a photo, or paste text. The + capture sheet links to it ("A syllabus, timetable, past paper or notes?").
  - `ai-inbox` gets the file name, the text of a PDF's first pages (read on the device) or the photo/scan, and the subject list. It answers the kind (syllabus, timetable, past paper, study material, task, other), a title, one sentence, the subject (or a new course name) and, for timetables, the weekly classes.
  - Nothing is saved until the student confirms. They can change the kind and the subject, and leave out classes.

  **Where it goes:**
  - A syllabus or past paper opens its own import screen already filled in. The hand-off is in memory for 10 minutes (`importHandoff.ts`); the screen reads it purely and clears it in an effect, which is safe with React's double rendering in development. So `ai-syllabus` and `ai-papers` still do the reading, with the student's check.
  - A timetable replaces only the class blocks, through the routine form model (`rowsToRoutine` → classes replaced → `validateRoutine` → `routineToRows`), so sleep, meals and the gym stay. Its courses can become subjects (a checkbox; off by default, because timetables also list things like "Library"). The routine is checked before any subject is made.
  - Study material: a PDF goes to the library (`addPdf` takes a title now). A photo becomes `materials.kind = 'image'` in the `images` bucket (the AI's 1600 px JPEG; Demo Mode keeps it in IndexedDB). Text becomes `kind = 'text'` with its text in `material_pages`. Ekagra's library still lists only PDFs; Ekagra Studio will show every kind. `deleteMaterial` now picks the bucket by kind.
  - A task or notice opens the capture sheet filled in (`captureStore.openWith`); `ai-capture` then finds the tasks. Demo Mode hands over text only.

  **Demo Mode:** no AI, so `classify.ts` guesses from words in the file name (counted 3 times) and the text, each rule counting once ("due to" isn't a deadline). It can't read timetables or photos and says so. When signed in, the same guess is used for a scanned PDF over 5 MB, which can't be sent to the AI.
- 2026-11-02: **Ekagra Studio, step 1: the app and its library** (M17). **The app:**
  - A second Vite app in `studio/`. It uses the root packages and `.env`, and reuses Ekagra's code through `@/` (Ekagra's `src`), with `@studio/` for its own. One repo, one database, no copied code.
  - It is checked by `npm run typecheck` (a project reference) and Vitest, and linted by oxlint like the rest.
  - Its CSS imports Ekagra's and adds one violet accent; its icon is a sibling of Ekagra's (two pages on violet).
  - Signed in only. The page a student opened before signing in is kept in `sessionStorage` and opened after Google sign-in. Every sign-in saves it first, so it's never cleared: clearing it on unmount broke under React's development double-mount.

  **The library:**
  - Subjects are read from Ekagra (empty states link there; Studio doesn't make subjects).
  - Materials of every kind: PDFs (`addPdf`), photos (made smaller to 1600 px, `addPhotoMaterial`), text and YouTube links (`kind = 'youtube'`, the canonical watch link in `source_url`).
  - YouTube links: `youtubeId` reads watch, youtu.be, shorts, embed, live, mobile and music links. The title comes from YouTube's public oEmbed (it allows calls from the browser, tested); without one, the video may be private, and Gemini only reads public videos, so Studio warns.
  - The material page uses the browser's own PDF viewer (`navigator.pdfViewerEnabled`; phones get "Open the PDF") and YouTube's privacy-enhanced player (`youtube-nocookie.com`). It moves a material between subjects or deletes it.
  - Notes lists show notes being made (checked every 10 seconds) and failed ones; Ekagra shows only finished ones.
  - The Studio pages were tested in the browser with Demo Mode data through a temporary change, removed again: Studio itself still needs sign-in.
  - Studio's own queries look again when the student comes back to it, because Ekagra may have changed things meanwhile.
- 2026-11-02: **Ekagra Studio, step 2: notes, mind maps and revision sheets with Gemini** (M17; Edge Function `studio-notes`, prompt `studio-notes-v1`; now 15 functions; `@ai-sdk/google` 4.0.109 added as a dev dependency like `@ai-sdk/anthropic`, approved). **Models and cost** (checked on Google's pricing page, November 2026):
  - Smart = Gemini 3.8 Flash for PDFs, photos and text; Fast = Gemini 3.5 Flash-Lite for YouTube videos. A video is about 100 tokens a second (an hour is about 360,000 tokens, about $0.11 with Flash-Lite), so the cheap model reads the long input.
  - 3.8 Flash is counted at Google's announced 2027 price ($1.50 / $7.50 instead of $0.75 / $3.75), so the shared $10 budget is never under-counted. On the free tier the price secrets can be 0.
  - Thinking is `low`: Gemini 3 has no "none" level, and the provider would then leave the model's own, higher default (read in the provider's source).

  **Gateway:** `readStudioAiConfig` (own key and models, shared limits). Provider-specific errors. `ensureQuota` is public, so the daily limit is answered before a note is saved. Gemini's model factory is in `_shared/gemini.ts`, so Ekagra's 14 functions don't bundle Google's SDK.

  **How a note is made:**
  - The note is saved as `processing` and returned at once; Gemini works in the background (`EdgeRuntime.waitUntil`), then the note becomes `ready` (title, Markdown, model, prompt version) or `failed` with the reason.
  - Problems known beforehand save nothing: no key, the daily limit, a wrong link, and with `YOUTUBE_API_KEY` a private, missing or over-3-hour video. A public video's title and length then go to the material.
  - A note still processing after 10 minutes was stopped by the function's time limit: Studio shows it as failed, with **Try again**.
  - A YouTube video goes to Gemini as its link (`fileData.fileUri`), never downloaded or transcribed by us; `_shared/gemini.test.ts` checks the real provider's request without a network.
  - PDFs are read on the device as text, from a chosen page, as many whole pages as fit in 60,000 characters (`textForNotes`). Scanned PDFs (up to 5 MB) and photos are sent as files.
  - The prompt keeps to what the reader shows (no tables, no LaTeX) and makes mind maps as outlines for `parseOutline`.
  - Studio edits a note (title and Markdown, with a preview) and deletes it; Ekagra shows only finished notes.
- 2026-11-02: **Ekagra Studio, step 3: quizzes from a note** (Edge Function `studio-quiz`, Gemini Smart, prompt `studio-quiz-v1`; now 16 functions). M17 is done. **How it works:**
  - **Test yourself** under a finished note asks for 5 or 10 multiple-choice questions: exactly 4 different options, the right one's index, an explanation and a difficulty. The function shuffles the options, because models like putting the right one first.
  - `studio-quiz` starts through `_shared/studioServer.ts` and `studioHttp.ts` (Studio's versions of `server.ts` and `http.ts`: Gemini secrets and models, the same limits), so Ekagra's functions still don't bundle Gemini.

  **Saved in Ekagra's tables, no new migration:**
  - The questions use Ekagra's check-question format (`type 'mcq'`, `options`, `answer { correct }`) with `source_ref { kind: 'studio', noteId }`, so they can be practised again without the AI. Ekagra's lessons, Practice and mock tests read only `kind: 'check'`, so they never mix them in (and regenerating a lesson can't delete them). The Academic Tollbooth asks any multiple-choice question of the subject, these included, which suits it.
  - Studio asks them with Ekagra's `CheckQuiz`. A finished quiz is saved like a lesson's check quiz: a `quizzes` row (kind `subject`, or `topic` when the note has one), an `attempts` row per answer and a mistake-notebook entry per wrong answer, so progress, the weekly review and the notebook count them. Topic mastery isn't changed: that stays with Ekagra's lessons. A stopped quiz saves nothing.
  - Deleting a note keeps its questions, because deleting them would delete their answers too.

  **Tested:** the function (`studio-quiz/feature.test.ts`), Google's real provider with the quiz's answer shape (`_shared/gemini.test.ts`, no network), the data layer (`studio/src/features/quiz/quiz.test.ts`, including that Ekagra reads a saved question back), and the whole quiz in the browser on Demo Mode data, through a temporary change that was removed again.

  **Lint:** oxlint's React Compiler rule `react/purity` flags `new Date()` in a click handler passed to a component like `Button`, as if it ran while drawing. Like `SpeakingTab`'s `nowMs`, the start time comes from a small helper outside the component.
- 2026-11-03: **Studio's failed notes, and a Library with everything.** **Why every YouTube note failed:**
  - Found with the timing in `notes` (each failed 1 second after it started, so not a timeout), free checks with the Gemini key (both models exist; the 2-hour video is 736,967 tokens, within the 1,048,576 limit) and the same request sent from this computer. Google answered **402 "Your prepayment credits are depleted"**: the key's project pays in advance and its credit was used up.
  - The gateway didn't know 402, so it showed "The AI service did not answer. Please try again in a minute", which hid the reason.

  **Fixed in the gateway (`providerError`):**
  - A plain message for no credit: Google's 402, and Anthropic's 400 "credit balance is too low", which had the same problem for Ekagra.
  - Gemini's tokens-a-minute 429 (waiting doesn't help when one request is too big), Gemini's 404 (a wrong model name), and the 2-minute timeout each get their own message.
  - `studio-notes` no longer blames the AI when saving fails, and says when Gemini ran out of time on a video.

  **Lectures are lighter:**
  - Videos over 20 minutes (or of unknown length) are sent with `videoMetadata.fps: 0.2`, one frame every 5 seconds; the sound stays in full.
  - Google's countTokens on the same 2-hour lecture: 330,563 tokens instead of 736,967, so about half the cost.

  **Long lectures in parts** (tested live with a free-tier key):
  - Even at 0.2 fps, the whole 2-hour lecture took Gemini over 2 minutes and was stopped. Supabase's free plan also stops a function after about 150 seconds.
  - Its first 30 minutes took 10 seconds, and all four 30-minute parts at the same time took 15 seconds. So the time goes on handling the whole long video at once, not on the amount of content.
  - So a video over 30 minutes whose length is known (`YOUTUBE_API_KEY`) is split into equal parts (`videoParts`). Each part is a clip (`startOffset`/`endOffset`) told which part it is, and one text-only request combines them (prompt `studio-notes-v2`). If any part fails, the note fails with that reason, and **Try again** redoes it.
  - End to end with the real handler and Gemini: 40 minutes in 2 parts gave notes with a summary and times from the start, in 17 seconds.

  **Ekagra's Library lists everything** (the product spec, §8.4, always had YouTube links in it):
  - PDFs, YouTube videos, photos, text and Studio's finished notes in one list, the newest first, with subject (now also "No subject") and type filters (`libraryItems.ts`, pure and tested).
  - PDFs still open in the PDF viewer. A new page, `/academics/materials/:id`, shows a video (YouTube's privacy-enhanced player, with "Open on YouTube"), a photo or text, with the notes made from it. The note reader now links back to a video too, and the Add inbox's "Open it" works for photos and text.
  - Studio's own copies of the listing, file links, text, names and icons moved into Ekagra's `src/features/materials/` (`materials.ts`, `kinds.ts`, `KindIcons.tsx`); Studio re-exports them, so both libraries show the same.
  - React's lint rule `react/static-components` warns about `const Icon = kindIcon(kind)` in a component: it can't tell the function returns the same icon each time. So icons are drawn by `MaterialIcon` and `NoteIcon`, which look them up in a fixed map.
