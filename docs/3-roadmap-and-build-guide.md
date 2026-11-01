# Roadmap and Build Guide

## 0. Current plan (overrides everything below)

**Decided 2026-11-01:** the roadmap is compressed into **2 phases, "Working App First"**. Phase 1 is a fully working end-to-end app. Where §1–§4 of this document, the product spec or the technical design disagree with this section, **this section wins**.

### Phase 1: the working app
1. **Shell and auth:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui + React Router + TanStack Query + Zustand + Capacitor (Android) + Supabase (Auth + Postgres with strict RLS).
2. **Today and the deterministic planner** (`src/features/planner/`): pure TypeScript 14-day scheduler (default budget 55% Academics, 25% Hustle, 20% Life), Now card, Minimum Day ("I Crashed" one-tap reset; missed work is spread out with at most +20% on any day), evening energy check-in (1–5 sliders).
3. **Academics:** subject and syllabus upload → dual-track topic tree (`exam` and `skill` tracks); past-paper priority `0.45 × examWeight + 0.35 × pyqScore + 0.20 × dependentsScore`; local pdf.js viewer with 1-click **AI Anchors** and a page tutor ("Ask about this page"); lazy topic generator (`ai-generate`: lessons, check quizzes, `ts-fsrs` flashcards); mistake notebook (1 → 3 → 7 day ladder); Python Coding Lab (CodeMirror 6 + Pyodide in a Web Worker).
4. **Hustle (moved up from P3):** templates (Freelancing, Content Creation, Startup, Custom; part-time work uses Custom), Kanban pipeline board, clients and transactions, automatic earnings per hour (net profit ÷ hours logged), Skill Bridge ("Learn this" creates a Skill-track course in Academics), AI screenshot/text task capture (`ai-capture`).
5. **Focus engine and FocusGuard:** Pomodoro and Deep Work timers; mode-switch warning when switching between Academics and Hustle during a scheduled block; Kotlin FocusGuard plugin with the **Academic Tollbooth**: answer 3 rapid-fire questions from your active subject to earn a 3-minute emergency unlock. This replaces the reason-based 5-minute unlock described in docs 1 and 2.

### Phase 2: everything else
the full AI tutor (chat threads and search across all your materials with pgvector; the page tutor is in Phase 1), YouTube lectures, weekly AI review, learning metrics and adaptive difficulty, mock tests, friends and accountability, attendance and marks, habits and the full Life section, Gmail/Calendar/Drive and the other integrations, exam season mode, strict mode, in-app feedback, the Tools app.

### Phase 1 milestones
The current milestone is the first unchecked one.

- [x] **M1 Foundation:** project structure, Tailwind + shadcn/ui, Phase 1 migration (`supabase/migrations/001_phase1_core.sql`) with RLS on every table and database tests (`tests/db/`), 5-tab app shell with Mode Chip and mode-switch warning (a temporary Mode Simulator on the Me tab stands in for the planner)
- [x] **M2 Supabase, sign-in, Android:** Supabase client, Google sign-in (web + Android), Demo Mode (no account, works offline), Capacitor Android app (`app.ekagra.student`), 4-step onboarding (profile, routine, rhythm, time budget) saved to `profiles` + `routine_blocks`, 14-day planner and priority engines (unit-tested) with a plan preview on Today. Supabase project linked, migration applied and `src/types/database.ts` generated
- [x] **M3 Academics (decided 2026-11-01: takes in M5–M7 and the page tutor), in 7 steps.** Done 2026-11-01; every step works in Demo Mode too. **Your one-time steps for real AI:** Gemini key → `supabase/functions/.env` → `npm run functions:secrets` → `npm run functions:deploy` (docs/4-setup-guide.md, step 6)
  1. AI gateway `supabase/functions/_shared/ai.ts` (Smart/Fast tiers, quotas, Zod check with one retry, `ai_usage`) and Demo Mode plumbing (`demoDb`: the same tables on the device; AI features give sample answers)
  2. Subjects; syllabus → `ai-syllabus` → dual-track topic tree editor; past papers → `ai-papers` → topic priorities (formula built in M2)
  3. PDF library (pdf.js, text extracted on the device), 1-click AI Anchors and the page tutor ("Ask about this page", saved as `ai_anchors` with action `ask`) through `ai-tutor`
  4. FSRS flashcards (`ts-fsrs`) and review sessions
  5. Mistake notebook (1 → 3 → 7 day ladder)
  6. Python Coding Lab: CodeMirror 6 + Pyodide in a Web Worker (loaded from a CDN on first use, then cached), code problems with tests, saved snippets
  7. Lazy lessons and 3–5 question check quizzes (`ai-generate`); wrong answers go to the mistake notebook. Full loop: lesson → check quiz → flashcards → mistakes
- [ ] **M4 Planner, Today and task capture (decided 2026-11-01: task capture moves here from M8), in 7 steps:**
  1. Mistake ladder: fixed after 3 right answers on different days (1 → 3 → 7 → fixed)
  2. Save the 14-day plan to `plan_blocks` (engine built in M2; `plan_version` for two devices); re-plan when the app opens with an old plan, when inputs change and on "Re-plan"; work already done counts against the estimates
  3. Mode Chip and mode-switch warning driven by the real plan blocks (remove the Mode Simulator); mode switches saved to `distraction_events`
  4. Now card (Start Focus: a simple block timer saved to `focus_sessions`; Done / Partial / Skip), Up next, reviews waiting
  5. Tasks and the global + Capture sheet: plain text or a screenshot → `ai-capture` → confirm sheet with unsure fields highlighted → `tasks` → planner; Due soon (72 hours)
  6. "I Crashed" minimum day (top block ≤ 30 min + reviews ≤ 15 min, the rest spread with at most +20% a day) and the 1-minute evening check-in (blocks, energy, mood, distraction) that re-plans tomorrow with the Burnout Guard
  7. Morning brief: 3 lines from `ai-brief` (Demo Mode: made on the device), cached for the day
- ~~**M5 PDF library and AI Anchors**~~: moved into M3 (step 3)
- ~~**M6 Learn loop**~~: moved into M3 (steps 4, 5 and 7)
- ~~**M7 Python Coding Lab**~~: moved into M3 (step 6)
- [ ] **M8 Hustle:** templates, Kanban, clients, transactions, time entries, earnings per hour, Skill Bridge (task capture with `ai-capture` moved to M4)
- [ ] **M9 Focus engine:** timers, focus sessions (hustle sessions add time entries), FocusGuard plugin, Academic Tollbooth
- [ ] **M10 Beta:** end-to-end polish, web deploy, APK for friends

The 12-week plan in §3 and the phases in §1 and §4 are kept for reference only.

## 1. Phases

| Phase | Goal | Rough length |
|---|---|---|
| **P1** Core loop | A daily study system you and your friends actually use | 12 weeks |
| **P2** Practice and challenge | Coding practice, adaptive difficulty, metrics, mock tests, weekly review, friends | 6–8 weeks |
| **P3** Hustle mode | Full hustle module, integrations, exam season mode | 6–8 weeks |
| **P4** Full Life section | Workouts, diet, sleep, speaking partner, burnout guard | ~6 weeks |
| **P5** Tools app and beyond | Tools app, browser extension, strict mode, iOS, more languages | Later |

Lengths are rough guesses for part-time work during college. Re-estimate after Phase 1.

## 2. Before week 1 (one weekend)

**Install** (skip what you already have): Node.js LTS, Git, VS Code, Android Studio (with an emulator; also test on your real phone), the Supabase CLI, and your AI coding tool.

**Create accounts:** GitHub, Supabase, Google Cloud (one project for sign-in, YouTube API and later Calendar/Gmail/Drive), your AI provider (enable billing and a $10 budget alert), Vercel or Netlify, Firebase (for App Distribution).

**Learn the basics** (about an hour each, with AI explaining): Git (commit, push, revert), running a Vite app, reading an error message, basic SQL (`select`, `insert`, `where`).

**Protect these docs first:** run `git init` in this folder, commit the docs and push to a private GitHub repo. When creating the app here, if a tool says "Current directory is not empty", choose **Ignore files and continue**, never "Remove existing files".

## 3. Phase 1: 12-week plan

Each week: build → test on phone and web → commit → tick the boxes.

### Week 1: Skeleton and login
- [ ] Vite + React + TypeScript app with Tailwind CSS, shadcn/ui and React Router
- [ ] Mobile-first layout with bottom tabs: Today, Academics, Hustle, Life, Me (placeholder pages)
- [ ] Capacitor Android project; the app runs on your phone
- [ ] Supabase project; Google sign-in on web and Android
- [ ] `profiles` table with RLS
- [ ] Web app deployed on Vercel or Netlify

**Done when:** you sign in with Google on your phone and on the web and see your name on the Me tab.

### Week 2: Onboarding, routine, AI plumbing, blocker test
- [ ] Onboarding: profile, timetable, sleep/gym/meals, rhythm, mentor style, time budget
- [ ] `routine_blocks`; Today shows your fixed day as a timeline
- [ ] `_shared/ai.ts`: tiers, Zod validation, quota check, `ai_usage` logging
- [ ] **Risk test (1–2 days):** a minimal FocusGuard that blocks Instagram for 5 minutes on your phone

**Done when:** your routine shows on Today, a test AI call is logged, and the test blocks Instagram.

### Week 3: Subjects and syllabus → topics
- [ ] Subjects with exam dates (or estimated)
- [ ] Syllabus upload: PDF (text extracted on the device) or photo (OCR)
- [ ] `ai-syllabus` → topic tree → review/edit screen → save `topics` and `topic_prereqs`

**Done when:** your real syllabus becomes an editable topic tree for every subject.

### Week 4: Past papers and roadmap
- [ ] Past-paper upload → `ai-papers` → questions linked to topics
- [ ] Priority score calculation with unit tests
- [ ] Roadmap screen: order, estimates, exam/skill filter, progress, target dates, "asked N times"

**Done when:** the roadmap shows a sensible order with past-paper counts.

### Week 5: Tasks and capture
- [ ] Task list, task detail, quick add in plain words (`ai-capture`)
- [ ] Screenshot/photo capture → confirm sheet
- [ ] Android share target (share from WhatsApp or the portal into the app)
- [ ] Local notification reminders

**Done when:** a portal screenshot becomes tasks with deadlines and reminders.

### Week 6: Planner v1 and Today
- [ ] Planner module with unit tests (free slots, reviews, deadlines, topics, energy, buffer, mixing subjects)
- [ ] Today: Now / Up next / Due soon; mark done, partial or skip
- [ ] Auto-recovery, minimum day, hustle time budget and hustle tasks
- [ ] Stretch: import Google Calendar events as fixed blocks

**Done when:** Today shows a realistic plan, and skipping a day reshuffles without a pile-up. **From here, use the app every day.**

### Week 7: Library (PDFs)
- [ ] PDF upload with on-device text extraction and a progress bar
- [ ] `jobs` table + `worker` on cron: OCR flagged pages, sections, chunks, embeddings, topic links
- [ ] PDF viewer with the AI side panel (explain page, simplify, example)

**Done when:** a 200-page book is processed and its chapters link to syllabus topics.

### Week 8: Lessons, quizzes, flashcards, mistakes
- [ ] `ai-generate`: lazy, per topic, cached
- [ ] Lesson screen; quiz player (MCQ, short answer graded by `ai-grade`, numerical); results screen
- [ ] Flashcards with `ts-fsrs`; daily review queue
- [ ] Mistake notebook; mastery updates

**Done when:** studying a topic = lesson → quiz → flashcards, and wrong answers land in the mistake notebook.

### Week 9: AI tutor, YouTube, learn anything
- [ ] `ai-tutor` with search over your materials and citations; Explain, Socratic and Exam modes
- [ ] YouTube link → segments → transcript sections → same pipeline; paste-transcript fallback
- [ ] Learn anything (basic): "Teach me X" → outline → lessons and quizzes without material

**Done when:** the tutor answers with page references, and a YouTube lecture becomes a lesson and a quiz.

### Week 10: Focus engine and app blocker
- [ ] Focus session screen (timer styles, current block, material link, "I got distracted")
- [ ] Full FocusGuard: permission setup screens, app picker, foreground service, overlay, emergency unlock, restore after restart, battery guide
- [ ] `focus_sessions`, `distraction_events`; actual minutes feed the planner

**Done when:** blocked apps can't be used during focus on your phone and on a friend's phone of another brand.

### Week 11: Life basics, progress, settings
- [ ] Habits (sleep, gym, meals, water) and the evening check-in (energy, mood) → lighter next day when energy is low
- [ ] Progress screen: mastery per topic, focus minutes, retention, streak
- [ ] Settings and customization (product spec §16)
- [ ] Morning brief (`ai-brief`, cached daily)

**Done when:** you can run your whole day from the app.

### Week 12: Friends beta
- [ ] APK via Firebase App Distribution + web link + a one-page setup guide (permissions, battery settings)
- [ ] In-app feedback button (`feedback` table)
- [ ] Admin page: AI spend per user and feature, active users
- [ ] Privacy policy page; data export and delete
- [ ] Fix the top bugs

**Done when:** 5+ friends use it daily and AI spend stays under $10/month.

### If you fall behind
Move these to Phase 2, in this order: YouTube processing → tutor Socratic/Exam modes → learn anything → morning brief → share target → Google Calendar import → automatic past-paper analysis (set priorities by hand).

**Never cut:** syllabus → roadmap, planner + Today + auto-recovery, PDF → lessons/quizzes/flashcards, tutor, app blocker.

## 4. Later phases

### Phase 2: Practice and challenge
- [ ] Coding practice: CodeMirror + Pyodide, problems per topic, test cases, hint ladder (`ai-hint`), failed tests into mistakes
- [ ] Elo-based question selection (~70% success)
- [ ] Four learning metrics + weekly challenge
- [ ] Mock tests in the exam pattern; exam readiness score
- [ ] Weekly AI review (`ai-review`)
- [ ] Accountability partner, friend groups, group focus sessions
- [ ] Attendance and marks/CGPA
- [ ] Gmail capture for college emails; Google Drive import; timetable from a photo
- [ ] Screen-time reports
- [ ] Learn anything with verified resources
- [ ] Offline cache for Today, flashcards and lessons

### Phase 3: Hustle mode
- [ ] Hustles with types, templates, phases and steps
- [ ] Pipeline boards per type; clients; transactions; time entries
- [ ] Profit, goal progress, earnings per hour
- [ ] Skill bridge → Skill courses in Academics
- [ ] AI hustle coach
- [ ] Mode-switch warnings with reasons
- [ ] Exam season mode
- [ ] Integrations: YouTube Analytics, Instagram, GitHub, Notion, PayPal/Stripe, Gmail parsing for freelance platforms; apply for the Upwork API; optional SMS parsing (direct APK only)

### Phase 4: Full Life section
- [ ] Workout plans and logging
- [ ] Meal logging by photo with estimates; daily targets
- [ ] Health Connect: sleep, steps, workouts
- [ ] AI speaking partner with feedback and progress
- [ ] Burnout guard; sleep vs study results in the weekly review

### Phase 5: Tools app and beyond
- [ ] Tools app on the same backend (notes, diagrams, flowcharts, revision sheets, PDF editor), linked to topics
- [ ] Browser extension: portal capture + website blocking
- [ ] Strict mode with a limited emergency override
- [ ] More coding languages (code-runner service); iOS app

## 5. Building with AI coding tools

You know basic code and AI will write most of it. That works well if you stay in control.

**Golden rules**
1. **One small task at a time.** "Build the quiz player screen", never "build the app".
2. **Plan first.** Ask the AI to list the files it will change and why before it writes code.
3. **Run it after every change.** Works → `git commit`. Broken → paste the exact error, or go back to the last commit.
4. **Make it explain.** "Explain this file like I'm a first-year student." You'll learn fast, and it counts as your own learning too.
5. **Tests for the brain.** Planner, priority and metrics code must have unit tests. Ask for the tests first.
6. **No secrets in chats or code.** API keys go only in `.env` and Supabase secrets.
7. **Watch for big rewrites.** If the AI wants to change 15 files for a small fix, stop and ask why.
8. **Stuck for an hour?** Ask for 2–3 different approaches and pick the simplest.
9. **Security check every milestone:** "Check that every table has RLS and no secret is exposed in the app."
10. **Keep the docs true.** When a decision changes, update the docs and the decisions log.

**Prompt template**
```
Read AGENTS.md and the parts of docs/ that matter for this task.
Milestone: Week N, <name>. Task: <one small task>.
First, list the files you'll create or change and why, then wait for my OK.
Then implement it, run the type check and tests, and tell me exactly how to test it on web and Android.
```

**First prompts for week 1**
1. "Create a Vite + React + TypeScript app in this folder. Keep the existing docs, README.md and AGENTS.md. Add Tailwind CSS and shadcn/ui. Explain each command before running it."
2. "Add React Router with a mobile-first layout and a bottom tab bar: Today, Academics, Hustle, Life, Me. Placeholder pages only."
3. "Add Capacitor for Android and show me step by step how to run the app on my phone."
4. "Set up Supabase: a client in `src/lib/supabase.ts`, Google sign-in for web and Android, and a migration for the `profiles` table with RLS."
5. "Deploy the web app to Vercel from my GitHub repo."

## 6. Beta with friends and proof for college funding

- **Recruit** 5–15 classmates with the same problem. Do a 20-minute setup session together (permissions, battery settings, syllabus upload).
- **Week 1 baseline:** screen time on social apps, study hours (self-reported), latest internal marks, and a 1–5 "I feel in control" score.
- **Track weekly:** active days, focus minutes, % of planned blocks completed, flashcard retention, time on blocked apps, AI cost per user.
- **Feedback:** in-app button + a weekly 15-minute group call or chat; fix the top 3 issues every week.
- **After 4–6 weeks:** compare with the baseline; collect quotes and short screen recordings.
- **One-page pitch for the college:** the problem, a demo, beta results, monthly cost per student, what funding unlocks (more students, stronger AI models, Play Store, iOS), and the roadmap.

## 7. Costs

| Item | At the start | With college funding |
|---|---|---|
| AI | ≤ $10/month, enforced by app quotas | Bigger budget; more Smart-tier use |
| Supabase | Free plan | Paid plan when free limits are reached |
| Web hosting | Free | Free or low |
| Android beta | Free (Firebase App Distribution / APK) | Google Play developer account (one-time fee) |
| iOS (Phase 5) | n/a | Apple Developer Program (yearly fee) |

Check current prices before paying for anything.

## 8. Risks

| Risk | What to do |
|---|---|
| Scope keeps growing | Phase gates, the cut line, no new features in the middle of a phase |
| AI bill too high | Lazy generation, Fast tier, quotas, `ai_usage` dashboard |
| AI gives wrong answers | Answers grounded in material, sources shown, "report wrong" button, editable content |
| Phones kill the blocker | Brand-specific setup guide; test on several phones |
| Google OAuth limits | Testing mode for the beta; verification before a public launch |
| Messy AI-written code | Small steps, tests, frequent commits, ask for explanations |
| Your own studies suffer | Add "build the app" as your hustle with a weekly time budget, inside the app you're building |
| Friends' privacy | RLS, minimal data, clear privacy policy |

## 9. Glossary

| Word | Meaning |
|---|---|
| API | A way for one app to read or send data to another app |
| OAuth | "Sign in with Google"-style permission to access an account |
| RLS (Row Level Security) | Database rules so each user only sees their own rows |
| Edge Function | A small piece of server code on Supabase that runs when called |
| Migration | A SQL file that changes the database structure, saved in Git |
| Embedding | Numbers that represent the meaning of text, used for search |
| RAG | Finding the relevant parts of your material and giving them to the AI before it answers |
| FSRS | The spaced-repetition algorithm that decides when a flashcard comes back |
| Elo rating | A skill score (from chess) used to pick questions of the right difficulty |
| Capacitor | Turns the web app into an Android app with access to phone features |
| APK | An Android app file you can install directly |
| Cron | A timer that runs server code on a schedule |
