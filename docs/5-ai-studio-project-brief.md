# Ekagra — Complete Project Brief for AI Analysis

> **How to use this document:** paste this entire file as the first message in Google AI Studio (Gemini 4 Argon). It is an information prompt, not a coding request. It ends with an explicit analysis task and output format. If the model can browse the web and you want it to inspect the code, also give it the repository: <https://github.com/becominharshit/Ekagra>. The brief is self-contained, so browsing is optional.
>
> **Date of this brief:** 8 November 2026. Everything below describes the project as built and verified on that date.

---

## 0. Your role and the job

You are acting as a combined **head of product, staff full-stack architect, AI-cost engineer, and design lead** for a student productivity app in India. You are advising a **first-year college student founder** who builds the product with AI coding tools, a small budget, and limited time.

You are the analysis model (Google AI Studio, Gemini 4 Argon). Use your strongest reasoning. Be concrete, honest and specific. Do not flatter the founder with generic praise. Do not propose a rewrite.

Your job in this conversation:

1. Understand the product, architecture, design and strategy from this brief.
2. Audit what exists, including its weaknesses and risks.
3. Propose what to build next, in what order, and why — with enough detail that the founder can turn the top recommendation into a milestone.
4. Tell the founder what **not** to build yet.

The full task and required output format are in **section 10**. Read the whole brief first.

---

## 1. The product in one page

### 1.1 Identity

- **Name:** Ekagra (Sanskrit *ekāgra*: "one-pointed focus").
- **Android app ID:** `app.ekagra.student`.
- **Category:** AI mentor / study planner / learning workspace for college students.
- **One-line promise:** *Open the app → see the one thing to do now → start.*
- **Positioning:** Studies, skills and life in one place. Not another content feed; a calm daily plan with notes and revision made for the way the student actually studies.
- **Two apps, one account and one database:**
  - **Ekagra** — the daily mentor: plan, Today, Academics, Hustle, Life, Focus, progress, account. AI is **Claude only**.
  - **Ekagra Studio** — the study room: materials, notes, mind maps, revision sheets and quizzes. AI is **Gemini only**, because Gemini can read public YouTube links directly.

### 1.2 The problem

An ambitious, hardworking Indian college student is stuck:

- Marks are low and practice is inconsistent.
- Social media fills every gap; time disappears.
- Studies, communication, health/gym/diet and a side hustle are juggled with no single plan, so the routine crashes and motivation drops.
- He wants a side hustle (freelancing, content, startup, tutoring) for exposure and money, but cannot start or sustain it.

**Root causes:**

- Too many areas + no plan → decision fatigue.
- No clear "next task" → he picks up the phone.
- No visible progress → motivation drops.
- Missed days pile up → guilt → quitting.

### 1.3 Vision

> An AI mentor that tells you what to do now, teaches you, tests you, protects your focus, and adjusts when life happens — across studies, side hustle and health.

The student follows the app like a personal mentor instead of planning everything himself.

### 1.4 Users and market

- **Primary now:** the founder and 5–20 friends/classmates. Ambitious but distracted; Android phone + laptop; Indian university curriculum; price-sensitive.
- **Later:** other colleges and years, school students, self-learners.
- **Assumptions:** Android-first (the founder's and friends' phones), English/Hinglish, low-end to mid-range phones, patchy connectivity, Google account already in use.
- **Beta success metrics (from the product spec):**
  - 5+ friends use it at least 5 days a week for 4 weeks.
  - 70%+ of planned blocks completed on average.
  - Focus minutes up and time on blocked apps down vs week 1.
  - Flashcard retention ≥ 85%.
  - Quiz scores or internal marks improve, and students feel more in control (1–5 survey).

### 1.5 Design principles (non-negotiable)

1. **One next task.** Today always shows the single most important thing to do now.
2. **AI proposes, student approves.** Topic lists, plans, lessons, flashcards and captured tasks can all be edited before saving.
3. **No guilt pile.** Missed work is spread out automatically; overdue lists never explode.
4. **Challenge, don't crush.** Targets rise only after steady success and drop when the student struggles.
5. **Fewer decisions, fewer distractions.** A feature that adds decisions or screens without removing others does not ship. No infinite feeds, ever.
6. **Grounded AI.** Answers come from the student's own material, with page or timestamp references when possible.
7. **Private by default.** Data is visible only to its owner unless the student chooses to share.

### 1.6 The two apps in detail

| | Ekagra (App #1) | Ekagra Studio (App #2) |
|---|---|---|
| Job | Plan the day, run the loop, track life, hustle and progress | Read, make and revise study material |
| AI | Claude Sonnet 5.5 (Smart) / Claude Haiku 5.5 (Fast) | Gemini 3.8 Flash (Smart) / Gemini 3.5 Flash-Lite (Fast) |
| Platform | Installable web app + Android (Capacitor) | Installable web app only |
| Demo Mode | Yes — no account, all data on the device | No — sign-in required |
| Owns | Subjects, topics, plan, tasks, focus, life, hustle, social, progress | Materials, notes, mind maps, revision sheets, quizzes |
| Reads/writes | Own tables plus Studio's finished notes (read-only) | Shared tables: subjects (read), materials, notes, questions, quizzes, attempts, mistakes |
| Address (dev) | `http://localhost:5173` (Vite default) | `http://localhost:5174` (`npm run dev:studio`) |

They connect only when the student signs in to both with the same Google account. Demo Mode cannot connect them. Ekagra never makes notes; Studio never runs the planner.

### 1.7 Business and beta strategy

- **Budget:** about **$10/month** at the start; college funding later if the beta shows results.
- **Platform:** Android app + installable web app from one codebase. Studio is a second web app in the same repo.
- **Distribution:** direct APK / Firebase App Distribution to friends for the beta; Play Store later. Web app on Vercel/Netlify/Cloudflare Pages (free tier planned).
- **Pricing:** no subscriptions or payments yet. The product is free for the beta. Monetization is an open question.
- **AI policy:** Ekagra is paid Claude only (no free tier), kept cheap with Haiku and lazy generation. Studio runs on Gemini's free tier while testing; model names and prices are environment secrets.
- **Moat hypothesis:** the integrated loop (plan → focus blocking → learning → notes → quiz → mistake → weekly re-plan) plus grounded AI and the Academic Tollbooth is harder to copy than a single-purpose notes or planner app.
- **Current stage:** **all planned milestones M1–M17 are complete.** The project is at the post-MVP point: it works end to end, but the **next milestone has not been chosen**. That is exactly what you are being asked to help decide.

### 1.8 What "working" means day to day

The daily loop the product is built around:

1. Morning brief (3 AI lines on what matters today).
2. Now card → Start Focus (apps blocked on Android).
3. Lesson → 3–5 question check quiz → flashcards.
4. Next block; reviews due; tasks captured from screenshots/notes.
5. Evening check-in (energy, mood, distraction) → tomorrow re-planned.
6. Sunday weekly review → 3 insights, up to 3 changes the student can apply in one tap.
7. Notes/revision: Studio makes notes, a flowchart mind map and a one-page formula sheet; Ekagra shows them typed or handwritten, and exports a PDF.

---

## 2. Current state (as of 8 November 2026)

### 2.1 What is built

- A complete **Ekagra** app: auth, onboarding, planner, Today, Academics, Hustle, Life, Focus/FocusGuard, Social, Me/account/privacy, weekly review, metrics, mock tests, attendance and grades.
- A complete **Ekagra Studio MVP**: library, materials of every kind (PDF, photo, text, YouTube), notes/mind maps/revision sheets from Gemini, note reading, edit/delete, and 5/10-question quizzes.
- **Demo Mode** across Ekagra: the same screens run on data kept in this browser/device, with AI features falling back to device-written samples or rules.
- **Android app** with native Kotlin plugins for app blocking (FocusGuard), file saving, notifications/reminders and Health Connect.
- **Installable PWA** with a hand-written service worker and a desktop side-nav layout.
- **16 Supabase Edge Functions** deployed; **9 SQL migrations** applied.
- **906 tests in 135 files pass**; type check, lint (4 existing warnings in UI primitives), both production builds and the Deno function check pass.

### 2.2 Quality gates

| Check | Command | Status |
|---|---|---|
| Unit/integration tests | `npm test` | 906 pass, 135 files |
| TypeScript | `npm run typecheck` | pass (strict, project references include Studio) |
| Lint | `npm run lint` (oxlint) | pass; 4 pre-existing Fast Refresh warnings in shadcn UI files |
| Web build | `npm run build` | pass |
| Studio build | `npm run build:studio` | pass |
| Edge Functions | `npm run functions:check` (Deno) | all 16 pass |
| PDF export | manual + tests | valid `%PDF-1.3`, pages cut at blank rows |
| Landing page | browser | no console errors, no horizontal overflow |

### 2.3 Deployed environment

- One Supabase project (free plan). Schema changes go only through `supabase/migrations/`; types are generated with `npm run db:types`.
- All 16 Edge Functions are deployed with the current code.
- Web hosting is not live in production yet; the beta APK and web build are shared directly.
- The repo is on `main` at <https://github.com/becominharshit/Ekagra>.

### 2.4 Current limitations (honest)

- **Free-tier Gemini notes are still shorter than promised.** The v4 prompt asks for 1,000+ words per 15-minute part; live runs give about 300–600. A 2-hour lecture's notes are useful but not truly "full-length". The stronger rule has not been verified live at length because much of the free YouTube allowance was used.
- **Free-tier limits:** about 250k input tokens/minute, 8 hours/day of YouTube video, ~150 seconds per Edge Function invocation. Parts and retries mitigate but do not remove them.
- **Gemini 3.8 Flash is intermittently 503 "high demand".** The gateway falls back to Fast, which works.
- **PDF export is image-based:** it looks exactly like the screen, but text inside the PDF is not selectable or searchable.
- **Handwritten view is a handwriting font** (Kalam, SIL OFL), not the student's own handwriting. Formulas stay typeset by KaTeX.
- **Studio needs sign-in** and has no Demo Mode, so notes cannot be tried offline/no-account.
- **No full chat tutor yet.** Only the page tutor ("Ask about this page") is built; embeddings/pgvector search across all materials is not.
- **No push service.** Android notifications are local (AlarmManager via FocusGuard); nothing arrives when the app has never been opened.
- **No analytics or crash reporting** in the beta.
- **No Play Store release, no payments, no subscriptions.** Google OAuth is still in Testing mode (up to 100 test users; refresh tokens expire after 7 days).
- **AI cost display:** `STUDIO_AI_PRICE_*` secrets are still nonzero; setting them to 0 makes the free tier display zero cost.
- **No iOS, desktop Tauri app, website blocking, or strict mode yet.** These are deliberately out of scope.
- **Deleting an account also deletes its `ai_usage` rows**, so the app's rolling 24-hour spend counts less for the rest of that day (known small gap).
- **Workout reading from Health Connect is not built** (only sleep and steps are read).

---

## 3. Feature inventory (as built)

### 3.1 Authentication and onboarding

- Supabase Auth with **Google sign-in** on web; on Android, sign-in opens the system browser and returns by deep link (`ekagra://auth/callback`).
- **Demo Mode**: one tap, no account, works offline, data stays on the device. Every screen works in both modes behind the same repo interface.
- 4-step onboarding: **profile** (name, college, program, year, semester), **weekly routine** (classes, sleep, gym, meals, commute), **rhythm** (chronotype, focus hours), **time budget** (default Academics 55% / Hustle 25% / Life 20%).
- Subjects, syllabi, exam dates, focus apps, mentor tone and first plan follow onboarding.
- Post-onboarding edits: Me → Edit routine and budget; `/onboarding?step=routine` opens the routine directly.

### 3.2 Today and the planner

- **Now card:** current block, subject/topic, minutes, what to do; **Start Focus**.
- **Up next**, **Due soon** (72 hours), **reviews due**, **day progress** (planned vs done per area).
- **Morning brief:** 3 AI lines (Fast tier), cached for the day; device-written in Demo Mode.
- **Focus session:** Pomodoro 25/5, Deep Work 50/10 or custom; pause/resume; Web Audio chime; idle guard pauses study sessions after 4 minutes without input; minutes focused go back to the block and, for hustle blocks, to `time_entries`.
- **"I got distracted"** reasons saved as `distraction_events`.
- **"I Crashed" / Minimum Day:** keeps the top block (≤30 min) + reviews (≤15 min), spreads the rest with at most +20% on any day; undoable the same day.
- **Evening check-in:** from 8 PM (or after the day's last block starts); marks unmarked blocks missed, records energy/mood/distraction, re-plans tomorrow with the **Burnout Guard** (30% less capacity when the last three check-ins of the week had energy ≤ 2).
- **Mode Chip:** Study / Hustle / Life / Free from the current plan block. Switching outside the scheduled area shows a warning (not a block), logs the reason, and never blocks the student.
- **Plan keeper:** re-plans when the app opens with an old plan or when planner inputs change; `plan_version` prevents two devices overwriting each other.
- **Classes today:** one-tap attendance (present/absent/cancelled) for routine class blocks linked to a subject.

**Planner (pure TypeScript, tested):**

- 14-day horizon; free slots from wake to sleep minus fixed blocks; 10–15% buffer.
- Reviews first in low-energy slots; deadlines earliest-first, aiming a day early; tasks due at a set time are placed before that time on the due day.
- Topics: `minutesPerDay = remainingMinutes ÷ daysUntilTarget`, target = exam date − revision days (default 10), remaining = Σ `estMinutes × speedFactor × (1 − progress)`.
- Ordering by `priority × urgency`, prerequisites respected; difficulty ≥ 4 goes to peak energy; subjects can be pinned to a part of the day (`planner.subjectWindows`).
- Skill courses get their own weekly minutes, paused in exam season.
- Area budgets reserve hustle and life time.
- 25–50 minute blocks, breaks, max 2 same-subject blocks in a row.
- Feasibility: impossible deadlines are marked "at risk" with options (buffer/weekend, skip skill topics, move a self-set date).
- `speedFactor` per subject = median(actual ÷ estimated) over recent topics, clamped 0.5–2.0.

### 3.3 Academics

**Subjects and roadmap**

- Subjects with code, semester, exam date (or estimated), color, credits, grade.
- Dual-track topic tree: **exam** (university wording, weighted by past papers) and **skill** (industry depth, optional, paused in exam season).
- Topic fields: parent, order, estimated minutes, difficulty 1–5, exam weight, past-paper count/share, priority, status, mastery, target date, learned-at.
- Syllabus import: PDF text read on the device, photo OCR via Fast AI; AI returns units → topics → prerequisites; the student edits before saving.
- Priority formula (code, not AI): `0.45 × examWeight + 0.35 × pastPaperScore + 0.20 × dependentsScore`.
- Roadmap shows order, estimates, progress, on-track/behind, projected finish.

**Past papers**

- Upload PDFs/photos; AI extracts each question (text, marks, type, year, topic).
- Per topic: times asked, share of marks, last year asked, typical types; a "most repeated" list feeds priority and mock-test patterns.

**Library and materials**

- One list of PDFs, YouTube links, photos, text materials and finished Studio notes; newest first; filters by subject (including "No subject") and type.
- PDFs open in a local **pdf.js viewer** with 1-click **AI Anchors** and a page tutor ("Ask about this page" — explain, simplify, example, make flashcards).
- YouTube links open in YouTube's privacy-enhanced player; photos and text have their own material page; each material lists the notes made from it.
- The **Add inbox** also files syllabi, timetables, past papers, study material and notices from upload, camera or drag-and-drop.

**Learn loop**

- **Lessons** generated lazily per topic when the student reaches it: explanation, key ideas, worked examples, common mistakes, exam-writing tip, source references.
- **Check quiz** after each lesson: 3–5 questions (MCQ, numerical, short answer); short answers are self-marked or AI-graded.
- **Flashcards** made from lessons/material, scheduled with **FSRS** (`ts-fsrs`, desired retention 0.90, 20 new cards/day, daily review cap); ratings Again/Hard/Good/Easy.
- **Mistake notebook:** every wrong answer/forgotten card enters a 1 → 3 → 7 day ladder; fixed after 3 correct answers on different days; a wrong answer restarts the ladder.
- **Mastery:** `0.6 × recent quiz accuracy + 0.4 × average FSRS retrievability`; learned at ≥ 0.8 (sets `topics.learned_at`).
- **Practice:** adaptive 10-question sessions using an Elo model; questions chosen for ~70% success; wrong answers go to mistakes; `quizzes.kind = 'subject'`.
- **Mock tests:** timed, pattern inferred from past papers (median counts per type/marks, 1.8 min/mark, full or half paper); auto-submit at deadline; written answers AI-graded, editable before saving; results per topic; under half marks goes to mistakes.
- **Progress:** four metrics (memory, learning speed, processing speed, problem solving), 9-week hand-drawn SVG charts, weekly challenge, exam readiness `0.4 × coverage + 0.4 × mastery + 0.2 × latest mock`.
- **Attendance:** percentage, safe bunks, classes needed to recover, rest-of-semester estimate; 75% default; warning before dropping below; percentages rounded down.
- **Grades:** editable 10-point scale, internal marks, credit-weighted SGPA/CGPA, earlier semesters, target CGPA calculator.
- **Coding Lab:** CodeMirror 6 editor + real Python via Pyodide in a Web Worker (loaded from CDN, 10-second limit); 8 starter problems with tests; code problems are `questions` type `code`; a saved-snippet library.

### 3.4 Ekagra Studio

- Separate Vite app, same repo and Supabase project; sign-in only, no Demo Mode; installable PWA.
- **Library:** subjects read from Ekagra; materials of every kind — PDF, photo, text, YouTube link.
- Add YouTube link with canonical URL parsing and title from YouTube oEmbed; warns that Gemini needs a public video.
- Material page: browser PDF viewer, photo, text, or YouTube privacy-enhanced player; move between subjects; delete.
- **Make from this:** Notes / Mind map / Revision sheet.
  - Note is saved as `processing` and returned immediately; Gemini works in the background with a 140-second deadline; result becomes `ready` or `failed` with a plain reason and **Try again**.
  - Long videos: 15-minute parts for full notes, 30-minute parts for mind maps/revision sheets, watched in parallel as clips; full notes are joined with `joinParts` (no combine request); mind map/revision sheet use one text-only combine request.
  - A mind map or revision sheet of a video that already has notes is made **from those notes**, in seconds.
  - PDF text read on the device, up to 60,000 characters from a chosen page; scanned PDFs up to 5 MB and photos sent as files.
- **Reading a note:** Typed (Markdown + KaTeX formulas), Handwritten (same words in Kalam on ruled paper), and **PDF** export of whichever view is showing. Mind maps render as a left-to-right flowchart with elbow connectors and horizontal scroll.
- **Edit/delete notes:** title and Markdown with preview.
- **Test yourself:** 5 or 10 MCQs from a finished note; exactly 4 options, shuffled; Fast tier; answers saved into Ekagra's `questions`, `quizzes`, `attempts` and `mistakes`, so progress, weekly review and the notebook count them. Topic mastery is deliberately unchanged. A stopped quiz saves nothing.
- Notes lists poll every 10 seconds while processing; the open note polls every 5 seconds.

### 3.5 Hustle

- Five types: **Freelancing, Content creation, Startup/business, Part-time/tutoring, Custom**.
- Each hustle has a goal (amount/date), phases with checkable steps from a template, tasks, time, money, links and notes.
- Custom hustles: `ai-hustle` (Smart) proposes phases/steps and pipeline columns; the student checks before saving; without AI, a general template.
- **Pipeline board:** columns per type; cards move with arrow buttons (works on touch), fractional `order_index` renumbering; moving a priced card to "Paid" offers to log the payment once.
- **Clients:** name, platform, contact, projects, total earned.
- **Money:** income/expenses, monthly net profit, goal progress; **earnings per hour** = net profit ÷ logged hours (pure, per hustle/client/month).
- **Time:** focus sessions on hustle blocks and Launchpad sessions add time entries; manual entries at noon local.
- **Skill Bridge:** "Learn this" on a skill step creates or links a Skill-track course in Academics with a weekly time limit.
- **Launchpad:** a 10-minute session with a goal when opening Upwork/Instagram/LinkedIn/etc.; a bar stays on every screen; "Did you do it?" logs 1–15 minutes.
- **Capture:** global + saves hustle tasks and leads; leads land in the first pipeline column.

### 3.6 Life

- **Habits:** daily/weekday habits, ticked or counted (e.g. 8 glasses), streaks over scheduled days, last 7 days.
- **Workouts:** three fixed programs (hostel room, dumbbells, gym push/pull/legs) as a rotation on chosen weekdays; logger with sets/reps/seconds/kg; own workouts; weekly progress and personal bests. No AI.
- **Meals:** photo (shrunk on device to 1280 px JPEG) or typed description → `ai-meal` estimates foods, calories, protein, carbs, fat with confidence; student edits before saving; photo never stored. 24 mess/hostel quick adds; daily targets; cheap-protein ideas; last 7 days.
- **Sleep and steps:** Health Connect on Android (sleep sessions, daily step totals, last 30 days, read-only) or manual entry; typed value wins; 7-night average vs 7–9 hours; regularity 0–100; steps vs 8,000 goal.
- **Speaking practice:** pick scenario and question; record up to 3 minutes (recording stays on the phone); browser speech-to-text (Chrome/Edge/Safari; often absent in Android WebViews) or type the words; `ai-speak` returns scores for clarity, structure, vocabulary, confidence, one strength and 1–3 tips; WPM and filler words counted in code; no audio stored.
- **Burnout guard:** several low-energy check-ins make the plan lighter.
- Health features are explicitly not medical advice.

### 3.7 Focus and FocusGuard (Android)

- Focus timer on web and Android; planned focus excludes breaks/pauses; session modes Pomodoro/Deep/Custom.
- **FocusGuard** Kotlin plugin + foreground service blocks chosen apps during focus sessions (optionally during every Study block).
- Blocked app shows a full-screen overlay: title, minutes left, **Back to study**, **Emergency unlock (Academic Tollbooth)**.
- **Academic Tollbooth:** 3 rapid-fire questions from the current subject (MCQs/numericals/flashcards/built-in maths), 20 seconds each; all right → 3–5 minute unlock, up to a daily limit; a wrong answer shows the answer, offers the mistake notebook, and the next try waits 60 seconds; attempts are logged.
- Permissions explained in plain words: Usage access, Display over other apps, notifications, battery unrestricted, Alarms & reminders; brand-specific battery guide (OnePlus, Realme/Oppo, Xiaomi/Redmi/POCO, Samsung).
- Events survive app closure; service restarts after reboot/update; blocked events saved as `distraction_events`.
- Launchpad and weekly-review reminders use AlarmManager (exact when allowed).

### 3.8 Social and accountability

- **Partner:** one-time code (7 days, up to 5 partners); share chosen numbers (focus minutes this week, study streak, plan done %, studying now); nudges (Time to study / Cheer / Check in), 3/day per friend.
- **Groups:** code (up to 30), "studying now", group focus 25/50/90 minutes (join for the time left), opt-in weekly focus leaderboard; owner leaving passes the group on.
- Sharing starts only when the student taps **Start sharing**; numbers computed on the device and published by `SocialSync`.
- Supabase Realtime for `shared_stats`, nudges, group sessions/members and `ai_anchors`; local notifications only when the app is in the background on Android.
- **Studio Bridge** (built earlier): link/deep-link handoff and BroadcastChannel between Ekagra and Studio, Realtime sync of AI anchors.

### 3.9 Me, account, privacy

- Progress dashboard, weekly review history, streaks.
- Weekly AI review every Sunday (customizable): week's numbers (hours per area, topics, accuracy, retention, focus, distractions, hustle income/time, sleep, workouts), 3 insights, up to 3 changes from a fixed list of 11 app-applicable changes; student accepts/edits/skips; plan re-runs.
- Settings: mentor tone, theme, focus timers/blocked apps, planner budget/rest day/buffer/exam season, learning cards/retention/language, notifications/quiet hours.
- **AI usage:** own requests vs daily limit, month's cost per feature, whole-app spend (secret key, no AI call).
- **Feedback:** bug/idea/other from every screen with optional screenshot and device details; status managed by the founder.
- **Privacy page** `/privacy` in plain words, every Android permission explained.
- **Export all data** as one JSON file on the device; Android saves via `FileSaver`.
- **Wipe data** (keeps account) and **delete account** (type DELETE; server checks too; deletes storage files then rows/auth user).
- **PWA:** installable, service worker network-first with saved `index.html` fallback; only opened files cached; no `skipWaiting`; desktop side menu at ≥1024 px.

### 3.10 Capture and the Add inbox

- Global **+** capture: plain text or screenshot → `ai-capture` (Fast) → confirm sheet with guessed fields highlighted → tasks; due date without time = 23:59; no estimate = 60 minutes; a task due at a set time is planned before it.
- **Add** in the top bar / Academics / drag-and-drop: upload, photo or paste text → `ai-inbox` classifies syllabus, timetable, past paper, study material, task or other; student confirms kind and subject; routes to the right import screen, routine (classes only, sleep/meals/gym stay), library, or capture sheet.
- Nothing is saved before confirmation. Demo Mode guesses from keywords and cannot read timetables/photos.

### 3.11 AI features and prompt versions

| Feature | Function | Tier | Prompt version | Notes |
|---|---|---|---|---|
| Syllabus → topic tree | `ai-syllabus` | Smart | `syllabus-v1` | Units, topics, minutes, difficulty, prerequisites, exam weight |
| Past papers → priorities | `ai-papers` | Smart | `papers-v1` | Extracts questions and maps to topics |
| Add inbox classification | `ai-inbox` | Fast | `inbox-v1` | Kind, title, subject, timetable classes |
| Task capture | `ai-capture` | Fast | `capture-v2` | Text/screenshot → tasks with unsure fields |
| Lessons + check quiz + flashcards | `ai-generate` | Fast | `generate-v1` | Lazy, one call per topic |
| Page tutor / AI anchors | `ai-tutor` | Fast | `tutor-v1` | Material page context |
| Written-answer grading | `ai-grade` | Fast | `grade-v1` | Up to 15 answers, marks in 0.5 steps |
| Morning brief | `ai-brief` | Fast | `brief-v1` | 3 lines, cached per day |
| Custom hustle plan | `ai-hustle` | Smart | `hustle-v1` | Phases, steps, pipeline columns |
| Weekly review | `ai-review` | Smart | `review-v2` | 3 insights + up to 3 app-applicable changes |
| Meal estimate | `ai-meal` | Fast | `meal-v1` | Photo and/or description |
| Speaking feedback | `ai-speak` | Fast | `speak-v2` | Text only; scores, strength, tips |
| Studio notes/mind map/revision sheet | `studio-notes` | Smart (text/PDF/photo), Fast (YouTube) | `studio-notes-v4` | Long videos in parts |
| Studio quiz | `studio-quiz` | Fast | `studio-quiz-v2` | 5/10 MCQs, 4 options, shuffled |
| AI usage (no AI call) | `ai-usage` | — | — | Secret key, reads spend |
| Account deletion (no AI call) | `account-delete` | — | — | Storage + rows + auth user |

Not built yet: full chat tutor with embeddings, `ai-hint` hint ladder, AI-generated code problems, AI workout plans (fixed programs instead), AI hustle coach (spec only).

---

## 4. Architecture

### 4.1 Stack

- **Frontend:** React 19 + TypeScript (strict) + Vite 8; Tailwind CSS 4 + shadcn/ui + Radix; React Router 8; TanStack Query 5; Zustand 5; Zod 4; date-fns 4; lucide-react icons.
- **Android:** Capacitor 8; native Kotlin plugins for FocusGuard, FileSaver, Health Connect; app ID `app.ekagra.student`; minSdk 24.
- **Backend:** Supabase free plan — Postgres + Row Level Security, Auth (Google), Storage (private buckets), Edge Functions (Deno), Cron, Vault, Realtime. pgvector is installed but not used yet.
- **AI:** Vercel AI SDK v7 inside Edge Functions. `@ai-sdk/anthropic` for Ekagra; `@ai-sdk/google` for Studio. Providers and model IDs live in secrets.
- **Documents:** react-pdf / pdf.js in the browser; text extraction on the device. Pyodide 314 in a Web Worker for Python.
- **Notes:** react-markdown + remark-math + rehype-katex; jsPDF + modern-screenshot for PDF export.
- **Spaced repetition:** ts-fsrs 6 (FSRS-7).
- **Tests:** Vitest 5 + PGlite (real migration/RLS tests); Deno check for functions; oxlint.

### 4.2 Repo and app layout

```
student-mentor-app/
├── AGENTS.md                 rules for AI coding tools
├── README.md                 project plan + dated decisions log
├── docs/                     product spec, technical design, roadmap, setup, this brief
├── src/                      Ekagra app (pages, components, features, lib, types)
│   ├── pages/                route screens
│   ├── components/           shared UI (shadcn in components/ui)
│   ├── features/             one folder per module (planner, academics, notes, focus, life, hustle, …)
│   ├── lib/                  supabase, demoDb, dates, native wrappers, PWA
│   └── types/database.ts     generated database types
├── studio/                   Ekagra Studio (second Vite app)
│   ├── src/pages/            library, subject, material, note, sign-in
│   ├── src/features/         notes, quiz, library
│   └── vite.config.ts        port 5174, aliases @studio and @shared
├── supabase/
│   ├── migrations/           001…009 SQL, RLS policies
│   └── functions/            16 Edge Functions + _shared
├── android/                  Capacitor project + Kotlin plugins
├── public/                   manifest, icons, service worker
├── capacitor.config.json
└── package.json
```

Path aliases: `@/…` = Ekagra `src/`, `@studio/…` = Studio source, `@shared/…` = Edge Function shared schemas. One root `node_modules`; Studio imports Ekagra's UI and data functions rather than copying them. `npm run typecheck` checks both apps through project references.

### 4.3 Frontend patterns

- Every screen uses **hooks backed by a repo interface** (`useSubjects`, `useNote`, …), never the Supabase client directly. The same interface has a Supabase implementation and a Demo Mode implementation.
- Every route is lazy-loaded; Vite splits React, router, Supabase, Query and Radix into shared chunks. No file over 500 kB.
- Mobile-first: top bar + 5 bottom tabs; at `lg` (1024 px) a side menu replaces tabs and pages widen.
- Pure logic (planner, priority, mastery, metrics, Elo, FSRS wrapper, attendance maths, PDF page slicing) lives in `src/features/**` with Vitest tests.
- Timestamps stored UTC (`timestamptz`), shown in the student's timezone.
- `__APP_BUILD__` is written into the build and shown on Me and in feedback reports.

### 4.4 Backend and data rules

- **Row Level Security on every table**, normally `user_id = auth.uid()`. Social tables have carefully designed read policies; codes are checked by `security definer` functions so students cannot read others' codes.
- **Two private storage buckets:** `materials` (PDFs) and `images` (photos, feedback screenshots); short-lived signed URLs.
- **Migrations only.** Applied with the Supabase CLI; database types regenerated after each change.
- **Demo parity:** every table also exists in the device-side `demoDb` (one localStorage key per table) with the same defaults/cascades; a parity test checks it against the migration. Files live in IndexedDB.
- **Export/delete completeness:** `_shared/userTables.ts` lists every table with student rows; a PGlite test checks export/delete order and cascade behavior.

### 4.5 The AI gateway (critical)

All AI calls go through `supabase/functions/_shared/ai.ts`:

1. Pick the **tier** (Smart/Fast) from environment config.
2. Check the student's **quota** (daily requests) and the app's rolling 24-hour budget (`ensureQuota` is public so a function can refuse before saving a row).
3. Call the model with a **deadline** for background work.
4. Validate the structured answer with **Zod**, retry once.
5. Log tokens, model and cost to `ai_usage`.
6. Map provider errors to plain messages (no credit, too big for the free tier, wrong model name, timeout, busy/limit) without logging prompts.

**Gemini recovery rules** (added 8 Nov 2026):

- A busy Smart model (500/503/504), a 60-second wait, or a 429 → hand over to Fast **once** (separate rate limits).
- A per-minute 429 waits Google's `RetryInfo.retryDelay` **once**, at most 61 seconds.
- A busy Fast model is retried **once after 2 seconds**.
- Each recovery only runs if at least 15 seconds remain; background work passes a deadline (Studio notes: 140 seconds) so waiting never exceeds the ~150-second free-plan function limit.
- A timed-out video says Gemini could not finish watching it.

**Provider split:** Studio's Gemini config (`readStudioAiConfig`) reads its own key/models/prices/reasoning plus the shared limits, so both apps log against one budget. The Gemini SDK factory lives in `_shared/gemini.ts`, imported only by `studio-*` functions; Ekagra's functions do not bundle Google's SDK. Studio starts through `_shared/studioServer.ts` and `studioHttp.ts`, its versions of `server.ts`/`http.ts`.

**Model strategy:** code knows only **tiers**. Current defaults:

- Ekagra: Smart `claude-sonnet-5-5` (reasoning low), Fast `claude-haiku-5-5` (reasoning none). Claude has no free tier; prices are built in.
- Studio: Smart `gemini-3.8-flash` (thinking low), Fast `gemini-3.5-flash-lite`; free tier while testing. Gemini 3 has no "none" thinking level.
- **Gemini 4 Argon** is known to the price table and is the likely next Studio upgrade; switching is a secret change plus regression tests, not a code rewrite.

### 4.6 The Studio notes pipeline (deep detail)

**Request:** material id, subject id, kind (`notes` / `mind_map` / `revision_sheet`), title, student program/year, and source:

- a public YouTube URL;
- text (a text material, or PDF text read on the device from a chosen page, as many whole pages as fit in 60,000 characters);
- a file (photo, or scanned PDF up to 5 MB).

**Before saving:** quota/budget, Gemini secrets, link validity; with `YOUTUBE_API_KEY`, the video must exist, be public and be ≤ 3 hours (title/length go to the material).

**Background job:** the note row is saved as `processing` and its id returned; Gemini runs in `EdgeRuntime.waitUntil` with a 140-second deadline. On success it fills title, Markdown, model, prompt version; on failure `status = failed` with a reason. A note still processing after 10 minutes is shown as failed (the function was stopped) with **Try again** (new row, old deleted).

**Video handling:**

- Sent as a `fileData.fileUri`; Google watches it, we never download or transcribe it.
- `videoMetadata.fps`: 1 fps up to 20 minutes, else 0.2 fps (one frame every 5 seconds) or when length is unknown. Audio is always full. Measured on a 2-hour lecture: 736,967 tokens at 1 fps vs 330,563 at 0.2 fps.
- **Parts:** a video longer than the kind's part length is split into equal clips (`videoMetadata.startOffset`/`endOffset`) watched in parallel, each told which part it is and to give times from the start of the video.
  - **Full notes:** 15-minute parts (`NOTES_PART_SECONDS`). Each part returns detailed Markdown; `joinParts` builds the final note: an overview with every part's times and summary, each part's Markdown, then all key points once. **No combining request**, so nothing is shortened and no extra tokens-per-minute request is made.
  - **Mind map / revision sheet:** 30-minute parts, then one text-only Fast request combines them.
  - A mind map or revision sheet of a video that already has **finished notes** is made from those notes (up to 200,000 characters) in seconds.
- A video over 30 minutes whose length is unknown (no YouTube API key) cannot be split; it is sent whole and may time out.

**Output prompt (`studio-notes-v4`):**

- Markdown the reader can show; no tables.
- Formulas are LaTeX: `$…$` inside a sentence; a display formula has `$$` alone on the line before and after it (remark-math reads one-line `$$…$$` as inline math).
- Simple LaTeX: `\frac`, `\sqrt`, `^`, `_`, Greek letters.
- A mind map must be an outline `parseOutline` can draw.
- Only facts from the material; full notes ask for at least 1,000 words per 15-minute part (not achieved on the free tier yet).

**Rendering and export (both apps):**

- `NoteBody.tsx`: typed view (Markdown/KaTeX) and handwritten view (same words, Kalam font on ruled paper), plus PDF.
- `MindMap.tsx`: left-to-right flowchart, boxes joined by elbow connectors, formula labels via KaTeX, horizontal scroll on phones.
- `exportNotePdf.ts`: the active view is mounted off-screen at A4 width (794 px), captured with `modern-screenshot` (scale 2, reduced to 1.25 or 1 for very long notes to stay inside canvas limits), cut into A4 pages at blank pixel rows (`pdfPages.ts`, pure/tested) so no line is sliced, then written by `jsPDF`. Both libraries load only on PDF press. Web downloads; Android writes base64 bytes through `FileSaver`.
- Background tabs do not run `requestAnimationFrame`; a 250 ms timer fallback keeps export moving.

**Quiz pipeline (`studio-quiz`):**

- Input: note id/title/Markdown (≤150,000 chars), count 5 or 10 (3–15 allowed), program/year.
- Output: `{ questions: [{ prompt, options (exactly 4, all different), correctOption 0–3, explanation, difficulty 1–5 }] }`; Zod checks options; the function trims to the requested count and shuffles options (models put the right answer first).
- Fast tier because Smart sometimes hung past 2 minutes; live: 5 questions in 4–5 seconds.
- Saved in Ekagra's check-question format with `source_ref { kind: 'studio', noteId }`; Ekagra's lessons/practice/mock read only `kind: 'check'`, so they never mix. The Tollbooth can use them. A finished quiz writes a `quizzes` row, `attempts`, and mistakes for wrong answers; mastery is untouched. Deleting a note keeps its questions.

### 4.7 Other AI pipelines (short form)

- **Syllabus:** text/OCR → Smart → units/topics with minutes, difficulty, prerequisites, exam weight → editable → `topics`/`topic_prereqs`.
- **Past papers:** text/OCR → Smart → per-question extraction → code aggregates counts/shares → priority formula.
- **Inbox:** filename + first pages text/photo + subject list → Fast → kind/title/subject/timetable classes → confirm → route.
- **Capture:** text/image + now/timezone/subjects → Fast → tasks with `unsure` fields highlighted → confirm.
- **Lessons:** topic + best chunks (currently page/lesson context) + past-paper pattern + level/language → Fast → lesson + 3–5 check questions + 5–15 flashcards; cached; manual regenerate keeps flashcards.
- **Page tutor:** page text → Fast → explain/simplify/example/flashcards; saved as `ai_anchors`.
- **Grade:** up to 15 written answers with marks/key points → Fast → marks in 0.5 steps + feedback + missing points + model answer; device fallback by keywords.
- **Brief:** today's plan/deadlines/last check-in → Fast → 3 lines; cached.
- **Hustle:** idea/skill/goal → Smart → name, 4–8 phases, 2–5 steps each, pipeline columns; check first.
- **Review:** week stats + current settings → Smart → 3 insights + up to 3 changes from 11 app-applicable types; Zod; device rules fallback; saved once a week.
- **Meal:** photo/description → Fast → foods/portions/calories/macros/confidence; photo not stored.
- **Speak:** transcript + counts (never audio) → Fast → 4 scores + strength + tips; prompt says no accent comments, no marking down for speech-to-text errors.

### 4.8 Demo Mode

- Enabled with `sma-demo-mode` in localStorage; user is a fixed `demo-user`; no network for data.
- `demoDb` mirrors every table; one localStorage key per table (`ekagra-demo-db:<table>`), defaults/cascades copied from migrations, parity-tested.
- PDFs/images in IndexedDB.
- AI features either use device logic (planner, brief, review, grading, speaking counts, task classification) or clearly marked samples (meal, partner, group).
- Rule: Demo Mode must never send data to a server; that is why speech-to-text is disabled there (Chrome sends audio to Google).

### 4.9 PWA and desktop

- `public/manifest.webmanifest`, icons (192/512/maskable/Apple), standalone display.
- Hand-written `public/sw.js` registered only in production web builds (`src/lib/pwa.ts`), never in dev or the Android WebView.
- Pages network-first, falling back to saved `index.html`, including on 5xx (proxy/captive Wi-Fi); hashed assets cached on first load; `ignoreVary`; each build has its own cache and no `skipWaiting`.
- Desktop at `lg`: side menu, wider page container (`max-w-4xl`), top bar spans the window, floating + moves to the corner.
- Tauri `.exe` is planned for later; not built.

### 4.10 Android native pieces

- **FocusGuard:** Kotlin plugin + foreground service (`specialUse` on Android 14+), UsageStats check every second, overlay blocker, unlock passes, boot receiver, queued events, AlarmManager reminders, battery guide. Pure decision logic (`FocusGuardState.kt`) has JUnit tests.
- **FileSaver:** opens Android's "Save to" screen (`ACTION_CREATE_DOCUMENT`) for JSON and now for binary base64 (PDF); no storage permission.
- **HealthBridge:** Health Connect client 1.1.0, minSdk 26 class isolated behind version checks so the app keeps minSdk 24; reads sleep and steps only; privacy rationale links to `/privacy`.
- **Capacitor config:** JSON (not TS) because the CLI cannot load a TS config under TypeScript 7.

### 4.11 Deployment and secrets

- App `.env`: only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, optional `VITE_CONTACT_EMAIL`, `VITE_STUDIO_URL`, `VITE_EKAGRA_URL`.
- Edge Function secrets (`supabase/functions/.env` → `npm run functions:secrets`): `AI_PROVIDER=anthropic`, `AI_API_KEY`, model IDs, reasoning levels, prices, `AI_MONTHLY_BUDGET_USD=10`, `AI_USER_DAILY_REQUESTS=150`, `YOUTUBE_API_KEY`, Studio's `GEMINI_API_KEY`/`STUDIO_AI_*`.
- Service role key, AI keys and OAuth secrets never reach the client. `.env` is never committed; `.env.example` lists variable names.
- One Supabase project; free projects pause after about a week of inactivity, so daily beta use keeps it awake.

---

## 5. Data model and security (summary)

Every table has `id uuid`, `created_at`, `updated_at`, and normally a `user_id` with an RLS policy. Nine migrations:

| Migration | Contents |
|---|---|
| `001_phase1_core.sql` | Profiles, routine, check-ins, subjects/topics/prereqs, materials/pages/sections/chunks, lessons, questions, quizzes, attempts, flashcards/reviews, mistakes, past papers, tutor threads/messages, tasks, calendar, plan blocks, focus sessions, distraction events, blocked apps, hustle tables, system tables, AI anchors |
| `002_hustle_mode.sql` | Part-time hustle type; hustle links |
| `003_beta.sql` | Feedback |
| `004_attendance_grades.sql` | Attendance, marks, semester results, subject credits/grade, routine subject link |
| `005_adaptive.sql` | Subject ratings, question rating, metric snapshots, challenges, `topics.learned_at` |
| `006_weekly_review.sql` | Weekly reviews |
| `007_life.sql` | Habits/logs, workouts, meals, sleep logs, step counts, speaking sessions |
| `008_social.sql` | Shared stats/view, partner invites/links, groups/members/sessions, nudges, security-definer functions, Realtime publication |
| `009_studio.sql` | Notes table; Studio quizzes reuse existing question/quiz/attempt/mistake tables |

**Key invariants:**

- A note requires a subject and is deleted with it; its topic/material links are cleared when those are deleted. Ekagra reads only `ready` notes.
- Studio quiz questions use `source_ref { kind: 'studio', noteId }` and do not change topic mastery.
- Health data: photos and recordings are never stored; only estimates/transcripts/scores.
- Shared stats: check constraints make an unshared number impossible to store; the view works out "studying now".
- Storage is private; export includes table rows + storage paths, not file bytes.

---

## 6. Visual design

### 6.1 Principles

- **Calm, professional, uncluttered.** One clear next step; no infinite feeds; no noisy dashboards.
- **App-like on a phone.** Safe areas, no rubber-band page scroll, no grey tap flash, 44 px+ touch targets.
- **One design across two apps.** Studio imports Ekagra's CSS and components; only its accent differs.
- **Light and dark** themes, both first-class.
- **A little warmth without cuteness.** Neutral surfaces, blue for study, amber for hustle, green for life, violet for Studio.

### 6.2 Design tokens

- Base: shadcn neutral palette in OKLCH — white background, near-black text (`oklch(0.145 0 0)`), white cards, light grey muted/secondary, near-black primary button, subtle borders (`oklch(0.922 0 0)`), destructive red.
- Dark: near-black background (`0.145`), dark grey cards (`0.205`), off-white text, translucent borders.
- **Mode colours:** Study blue `oklch(0.546 0.245 262.881)`, Hustle amber `oklch(0.666 0.179 58.318)`, Life green `oklch(0.596 0.145 163.225)`, Free grey. Each has a lighter dark-mode variant. Used as `bg-mode-study/15`, `text-mode-hustle`, etc.
- **Studio accent:** violet `oklch(0.541 0.281 293.009)` (dark: `0.702 0.183 293.541`), used sparingly: mark, selected item, highlights.
- **Handwritten:** paper `#fdf8e8` with 28 px blue rule lines (12% opacity); ink `#223a6b`; Kalam 400/700; 17 px/28 px leading.
- Radius: base `0.625rem`; cards/inputs use md/lg, sheets xl.
- Shadows: very subtle; the landing card uses a soft blue-tinted shadow.

### 6.3 Typography

- **Geist Variable** for everything (UI, headings and body); heading font = sans. Tight tracking on headings.
- Landing hero: 4xl → 5xl → 6xl, semibold, balanced text; one phrase in Study blue.
- Reading view: 15–16 px body, larger h1/h2; long notes get more line height.
- Handwritten: Kalam with `font-hand`; headings bold, body regular.

### 6.4 Layout and navigation

- **Phone:** top bar 56 px (Ekagra wordmark, Demo badge, Add, Feedback, Mode Chip), content `max-w-2xl` with 16 px side padding, bottom tab bar 64 px with 5 tabs (Today/Academics/Hustle/Life/Me), floating + above it.
- **Wide:** side menu (same 5 items) replaces the bottom bar; top bar spans the window; content `max-w-4xl` with 32 px padding.
- Page header: back link, title, one-line description, actions on the right.
- Cards: rounded-xl, 1 px border, white/dark surface, 16 px padding, 12 px gaps.
- Empty states: short explanation + one clear action.
- Loading: page-level skeleton/spinner; no layout jumps.

### 6.5 Components

- shadcn/ui + Radix: Button, Card, Badge, Dialog, AlertDialog, Sheet, Tabs, ToggleGroup, Input, Textarea, Select, Checkbox, Progress, Skeleton, Tooltip.
- Status language: green = done/right, red = wrong/destructive, amber = hustle/warning, blue = study/active.
- Charts: hand-drawn SVG (no chart library); minimal axes, calm colours, clear labels.
- Forms: labels above fields, inline help, errors under the field, `role="alert"`.

### 6.6 Landing and sign-in (`/sign-in`)

- Public, full-screen, no app shell.
- Background: two soft radial glows — Study blue at top-left, Life green at bottom-right.
- Header: ring-and-dot favicon + "Ekagra", Privacy link.
- Hero: pill "Studies, skills and life in one place"; H1 "One clear next step. / **Every day.**" (second line blue); one-sentence explanation; four feature items with blue icon tiles:
  1. A plan for today
  2. Notes that make sense
  3. Skills beside studies
  4. Progress you can see
- Right: white card "Start where you are", Google button (G logo) and Demo Mode button; Demo Mode becomes primary when Supabase is not configured; privacy note; "Free to start. Your data stays yours."
- Footer: "Built for students in India. Your data stays yours." + privacy/permissions link.
- No stock photos, no gradients on buttons, no marketing clutter.

### 6.7 Note reading and PDF design

- Typed: clean Markdown, 15–16 px, headings stand out, formulas centred when display, tables banned, code blocks scroll.
- Handwritten: ruled paper, blue ink, Kalam; a small "Ekagra · handwritten" label; the same content, not a different summary.
- Mind map: left-to-right boxes, subject root at left, branches with elbow connectors; key formulas inline; horizontal scroll on phones; no tiny text.
- PDF: A4, 12 mm margins, white paper, header with "Ekagra · notes/revision sheet", title, then content; handwritten PDF keeps the ruled paper; pages break at blank rows.

### 6.8 Iconography and brand

- **Ekagra mark:** a white ring with a dot in the centre ("one-pointed focus") on the Academics blue background; used as favicon and PWA icon.
- **Studio mark:** two pages on violet.
- Icons: lucide-react, 1.8 stroke default, 2.4 when active; 20 px in tabs, 16 px in buttons.
- Illustration is avoided; one strong idea per screen.

### 6.9 Motion and feel

- Fast (150–200 ms) colour/opacity transitions; no decorative animation.
- Focus chime on phase end (Web Audio), no sound elsewhere.
- Sheets slide up on mobile; dialogs fade/scale subtly.
- Charts and progress animate only on first render, not on every poll.

### 6.10 What to avoid

- Dense dashboards, gradients everywhere, emoji as icons, glassmorphism, neon, gamified confetti, infinite scroll, social feeds, red badges that create guilt.
- New decisions on the Today screen. The next action must be obvious.
- Anything that makes the Android app feel like a website (tiny tap targets, hover-only affordances, rubber-band scrolling).

---

## 7. Strategy in more detail

### 7.1 Wedge and differentiation

- **Wedge:** "the app that tells you what to do now" — not a notes app, not a planner, not a blocker, but the loop that connects them.
- **Differentiators:**
  1. Deterministic planner + auto-recovery + minimum day (not an AI-generated schedule that changes randomly).
  2. FocusGuard with the **Academic Tollbooth** — earning distraction unlocks with subject questions is memorable and defensible.
  3. Ekagra Studio's YouTube → notes → mind map → revision sheet → quiz pipeline, on a free tier.
  4. Integrated mistake notebook and weekly review that change next week's plan.
  5. Demo Mode with no account — low-friction trial.
- **Weaknesses to consider:** broad surface area for a solo founder; two apps double the UX; the beta audience is small; free-tier AI limits; no social loop yet.

### 7.2 Distribution

- Founder's college and friends first; WhatsApp/Telegram groups; direct APK; demo on a laptop.
- Later: campus ambassadors, study communities, YouTube/Instagram clips showing the Tollbooth and notes pipeline, Play Store listing.
- Trust is the constraint in India: privacy page, no ads, no selling data, clear AI use.

### 7.3 Monetization (open)

- Options to evaluate: free with AI limits → paid "Pro" (higher AI quota, longer notes/revision, more Studio generations); one-time student lifetime price; college licensing; affiliate to books/courses is probably a bad fit.
- Indian student willingness to pay is low; price in ₹, monthly and semester plans; keep a generous free tier.
- Costs: Claude is paid; Gemini free tier can disappear or change; Supabase free plan pauses. Model the cost per active student before pricing.

### 7.4 AI economics

- Lazy generation is the main saving: lessons/quizzes only when a topic is reached; notes only on demand; weekly review once a week.
- Fast tier for ~90% of calls; Smart only for planning/analysis.
- Long videos dominate Studio cost; 0.2 fps and 15-minute parts are the current mitigations.
- Caching: lessons, briefs, weekly reviews, notes.
- Quotas: per-student daily requests, app-wide rolling 24-hour budget, monthly budget.
- Upgrade path: Gemini 4 Argon for Studio, Claude tiers for Ekagra; prices in env so the budget stays honest.

### 7.5 Risks

- **Product risk:** too many features, not enough daily value; students use it for a week and leave.
- **AI risk:** free-tier limits, model outages, cost spikes, hallucinations in notes/quizzes, YouTube terms.
- **Technical risk:** RLS bugs, data loss, Android background-service kills, storage limits.
- **Founder risk:** solo first-year student, limited time; scope creep; building features before retention.
- **Compliance risk:** Google OAuth testing, Play Store permissions (usage access, overlay, Health Connect), privacy policy accuracy, copyright of uploaded books.
- **Competition:** Notion, Google Calendar, Forest, Anki, YouTube study tools; the integrated loop is the answer, not feature count.

---

## 8. Hard constraints and project rules

These are rules the founder works under; recommendations must respect them.

1. **Keep the MVP simple.** One small task at a time; don't build ahead of the chosen milestone.
2. **No new libraries without approval.** The approved stack is listed above. Prefer what is already installed.
3. **TypeScript strict, avoid `any`.**
4. **Database changes only through SQL migrations**, with RLS on every table; regenerate types.
5. **Every feature works in Demo Mode and with Supabase.** Screens use repo-interface hooks, never the Supabase client directly.
6. **All AI calls go through `_shared/ai.ts`** (tiers, quota, Zod, usage logging).
7. **Pure logic must be pure and tested** (planner, priority, mastery, metrics, FSRS, attendance, PDF slicing).
8. **Timestamps UTC, display in the student's timezone.**
9. **Mobile-first**; must work in the Android WebView and desktop browsers.
10. **Native Kotlin only for what the web cannot do.**
11. **Secrets only on the server.** Never commit `.env`; never put the service role key in the client.
12. **Ekagra is Claude-only; Studio is Gemini-only.** Don't mix providers across apps.
13. **Prompts live in `_shared/prompts/` with a version**; bump the version when wording changes.
14. **Explain new concepts simply; run typecheck/tests after each step; give web and Android test steps.**
15. **Budget:** ~$10/month AI, Supabase free, hosting free. Any proposal with recurring cost must justify it.
16. **No public launch yet.** The beta is 5–20 students; Play Store and payments come later.
17. **No infinite feeds, no ads, no selling data, no guilt mechanics.**
18. **Don't rewrite large parts of the app to fix a small problem.** No migration to another framework.

---

## 9. Known gaps and open problems (ranked by pain)

| # | Problem | Impact | Current mitigation | Directions worth evaluating |
|---|---|---|---|---|
| 1 | Free-tier Gemini writes only ~300–600 words per 15-min part, not the 1,000+ asked | "Full notes" promise not met; long lectures feel thin | More parts (15 min); prompt asks for length; paid key would help | Smaller parts (5–8 min), per-section word budgets, two-pass expand, section-by-section generation, combine with Fast, paid-tier fallback, or reposition as "complete but concise" |
| 2 | Free-tier limits: 250k input tokens/min, 8 h/day YouTube, ~150 s per function | Long videos and high usage fail | Parallel parts, retries, 140 s deadline, Fast fallback | Queue/retry later, per-user video-minute quota, shorter default parts, paid key for heavy users, pre-generate at night |
| 3 | Gemini 3.8 Flash intermittently 503 | Notes/mind maps occasionally fail or slow | Smart→Fast fallback | Evaluate Gemini 4 Argon; add a visible "using Fast" note; better retry UX |
| 4 | PDF export is image-only | Can't select/search text, larger files | Looks identical to screen; valid PDF | Add an optional text-layer PDF (jsPDF text + KaTeX raster), or export Markdown/HTML too |
| 5 | Studio has no Demo Mode | Can't try notes without an account; harder onboarding | Landing page explains; Demo Mode only in Ekagra | A read-only sample note in Demo Mode, or a "try one note" sandbox with a server-side demo quota |
| 6 | Full chat tutor + embeddings not built | Page tutor only; no cross-material answers | Page context + anchors | pgvector search, thread UI, citations; cost per query; maybe after retention is proven |
| 7 | No push notifications | Weekly review/nudges only local; no re-engagement | AlarmManager local reminders | FCM (needs a paid service? free) later; not before retention |
| 8 | No analytics/crash reporting | Blind to drop-off and errors in beta | Feedback button + manual testing | Lightweight event log in Supabase (privacy-safe), Sentry free tier |
| 9 | No Play Store/payments | Distribution limited to APK/web | Direct install | Play Store readiness: permission declarations, privacy policy, data safety, Health Connect form |
| 10 | Google OAuth in Testing | 100-user cap, 7-day refresh | Beta size is fine | Verification before public launch |
| 11 | AI spend display nonzero price secrets | Studio looks like it costs money on free tier | Docs note | Set `STUDIO_AI_PRICE_*` to 0 for the free beta |
| 12 | Handwriting is a font, not personal handwriting | Might disappoint if oversold | UI says "Handwritten" | Label as "Handwriting view"; later a real handwriting font per student or stylus input |
| 13 | Long videos without `YOUTUBE_API_KEY` can't split | Timeouts on >30 min | Warning; API key recommended | Require the key for Studio, or split by transcript/unknown length heuristics |
| 14 | No exercise of AI quiz quality metrics | Hard to know if questions are good | Manual checks | Track answer accuracy per generated quiz, flag bad questions, allow report |
| 15 | Broad surface area vs solo founder | Slow progress, shallow features | Milestones, ruthless scope | Pick one retention loop; defer breadth; use "do not build" list |

---

## 10. What I want from you (the analysis task)

Produce a single, well-structured advisory report in Markdown. Be specific to Ekagra; do not give generic startup advice.

### 10.1 Mandatory deliverables

1. **Executive snapshot (≤10 bullets).** What Ekagra is, its stage, its strongest asset, its biggest risk, and the one thing you would do next.
2. **Honest audit (scored 1–5 each, with evidence).**
   - Product clarity and focus
   - Daily-loop strength and retention potential
   - UX and visual design
   - Architecture and maintainability
   - AI design and cost control
   - Android/Play Store readiness
   - Privacy/security
   - Go-to-market readiness
   For each: score, why, and the single highest-leverage fix.
3. **North-star metric and metric tree.** Define one north-star for the 20-student beta and 5–7 supporting metrics with target ranges and how to measure them without heavy analytics.
4. **Prioritized next steps (30 / 60 / 90 days).** At most 7 items. For each: problem it solves, user value, MVP scope, effort (S/M/L), AI/hosting cost, dependencies, risk, success measure, and which existing modules/files it touches. Rank by impact ÷ effort.
5. **Feature proposals (10–15, table).** Columns: feature, user problem, MVP scope, complexity, AI cost, differentiation, recommendation (Build now / Next / Later / Don't build). At least 3 should strengthen the **daily loop/retention**, 2 the **notes-to-revision loop**, 2 **distribution/growth**, 2 **AI cost/quality**, and 1 **Android/Play readiness**.
6. **Solving the note-length problem.** Give 3–4 concrete options for producing genuinely full notes on a free-tier Gemini key, with trade-offs, expected cost/time, and a small experiment design (what to change, what to measure, pass/fail). Include a recommendation.
7. **AI architecture review.** Evaluate model choices, the gateway's recovery rules, part-splitting, prompt versions, caching, quotas and cost per active student. Say what to change before 100 users, and what not to change.
8. **UX/design review.** Specific, respectful of the existing calm design language. Cover the first-run experience, Today, note reading, Studio's library, and the landing page. Give 5–8 concrete changes, not a redesign.
9. **Strategy and monetization.** Positioning, the wedge, distribution in Indian colleges, and 2–3 pricing models with rough ₹/month and cost assumptions. State what must be true before charging.
10. **Do-not-build list.** 5–8 things that look attractive but should wait, with reasons.
11. **Open questions for the founder.** At most 10, only ones that would materially change your recommendation.
12. **If the founder picks your top 3:** turn them into a milestone plan in this project's style — numbered small steps, each independently testable, with acceptance criteria, test plan (web + Android), and what goes in Demo Mode.

### 10.2 How to prioritize

Use a simple, explicit method (for example impact × confidence ÷ effort, or RICE). Show the scores. Optimize for:

- **Retention of 5–20 beta students over 4 weeks**, not downloads.
- **The daily loop** (plan → focus → learn → review), not feature count.
- **Low AI cost and graceful failure on free tiers.**
- **Buildable by one first-year student with AI help** in small steps.
- **Trust** (privacy, correctness, no hallucinations presented as fact).

### 10.3 Output rules

- Be concrete: name the screen, module, table, function or prompt version when relevant.
- Use tables for comparisons and scores.
- Include rough effort in days/weeks and cost in USD and INR where money matters.
- Distinguish **facts from this brief** vs **your assumptions**; label assumptions clearly.
- Prefer small, reversible steps over rewrites.
- Do not write production code unless the founder asks in a later message. Pseudocode or a schema sketch is fine.
- Do not invent APIs, model capabilities, prices or user research. If something is unknown, say what to test.
- Do not recommend adding a paid service or library without a cost/benefit case.
- Do not recommend a framework rewrite, React Native/Flutter, iOS, or a public launch now.
- Challenge the founder where the plan is weak, especially scope and retention.
- Keep the tone direct, warm and practical. Explain jargon in simple words.

### 10.4 Questions to answer explicitly

1. What is the **single best next milestone** for Ekagra, and why is it better than the obvious alternatives?
2. Which existing features are **not earning their keep** and should be simplified or hidden during the beta?
3. How can the app prove **learning outcomes** (marks, retention, quiz accuracy) to a skeptical student and to a college?
4. What is the smallest change that would make a student **open Ekagra every day without a notification**?
5. How should the **two-app split** evolve? Keep both, merge them, or make Studio a tab inside Ekagra?
6. What should the **free vs paid line** be, and what must be true before charging?
7. What are the **three biggest technical risks** before 100 users, and how should they be de-risked now?
8. Where is the current **visual design** helping or hurting trust and comprehension?
9. What should the founder **stop doing** for the next 30 days?
10. If the founder has only **10 hours a week**, what is the 4-week plan?

---

## Appendix A: exact inventory for reference

### A.1 Edge Functions (16)

`account-delete`, `ai-brief`, `ai-capture`, `ai-generate`, `ai-grade`, `ai-hustle`, `ai-inbox`, `ai-meal`, `ai-papers`, `ai-review`, `ai-speak`, `ai-syllabus`, `ai-tutor`, `ai-usage`, `studio-notes`, `studio-quiz`. Shared code lives in `supabase/functions/_shared/` (`ai.ts`, `aiCore.ts`, `gemini.ts`, `anthropic.ts`, `schemas.ts`, `prompts/`, `respond.ts`, `admin.ts`, `userTables.ts`, `youtube.ts`, `studioServer.ts`, `studioHttp.ts`).

### A.2 Migrations (9)

`001_phase1_core.sql`, `002_hustle_mode.sql`, `003_beta.sql`, `004_attendance_grades.sql`, `005_adaptive.sql`, `006_weekly_review.sql`, `007_life.sql`, `008_social.sql`, `009_studio.sql`.

### A.3 Main routes (Ekagra)

`/sign-in`, `/privacy`, `/auth/callback`, `/onboarding`, `/today`, `/today/focus`, `/academics`, `/academics/subjects/:id` (+ edit/import/practice/mock/papers), `/academics/library`, `/academics/library/:materialId`, `/academics/materials/:materialId`, `/academics/notes/:noteId`, `/academics/topics/:topicId`, `/academics/review`, `/academics/cards`, `/academics/mistakes`, `/academics/code`, `/academics/code/:snippetId`, `/academics/attendance`, `/academics/progress`, `/academics/grades`, `/hustle`, `/hustle/:id`, `/life`, `/me`, `/me/focus`, `/me/account`, `/me/friends`, `/me/review`, `/tasks`, `/tollbooth`, `/focus`.

Studio routes: `/` (library), `/subjects/:id`, `/unfiled`, `/materials/:id`, `/notes/:id`, `/sign-in`.

### A.4 Prompt versions

`syllabus-v1`, `papers-v1`, `inbox-v1`, `capture-v2`, `generate-v1`, `tutor-v1`, `grade-v1`, `brief-v1`, `hustle-v1`, `review-v2`, `meal-v1`, `speak-v2`, `studio-notes-v4`, `studio-quiz-v2`.

### A.5 Key package versions

React 19.3, React Router 8.5, Vite 8.3, TypeScript 7.0, Tailwind 4.3, shadcn 4.23, Radix 1.8, TanStack Query 5.105, Zustand 5.0, Zod 4.6, date-fns 4.4, Capacitor 8.6, Supabase JS 2.118, Vitest 5.0, AI SDK 7.0, `@ai-sdk/anthropic` 4.0.94, `@ai-sdk/google` 4.0.109, ts-fsrs 6, react-pdf 11, CodeMirror 6, Pyodide 314, jsPDF 4.2, KaTeX 0.19, react-markdown 10.1, remark-math 6, rehype-katex 7, modern-screenshot 4.7.

### A.6 Model and pricing assumptions

- Claude Sonnet 5.5: $2 / $10 per million input/output tokens.
- Claude Haiku 5.5: $0.10 / $0.50 per million (higher above 100k-token prompts).
- Gemini 3.8 Flash: budgeted at $1.50 / $7.50 per million (2027 price, deliberately conservative).
- Gemini 3.5 Flash-Lite: $0.30 / $2.50 per million.
- Gemini 4 Argon: price known in `_shared/aiCore.ts`; not yet deployed.
- Budget: `AI_MONTHLY_BUDGET_USD=10`, enforced per rolling 24 hours at 1/30 of the budget; `AI_USER_DAILY_REQUESTS=150`.
- Claude has no free tier. Gemini free tier is used only while testing Studio; it is not guaranteed.

### A.7 Beta metrics currently observable without new tooling

- Planned vs completed blocks (`plan_blocks`).
- Focus minutes and distractions (`focus_sessions`, `distraction_events`).
- Flashcard retention and reviews (`flashcard_reviews`).
- Quiz accuracy (`attempts`, `quizzes`).
- Weekly review completion (`weekly_reviews`).
- AI usage and cost (`ai_usage`).
- Feedback (`feedback`).

### A.8 The founder's working style (important for advice)

- First-year student; AI writes most of the code; learns concepts as they go.
- Works in small steps, commits after each working step, and expects exact web/Android test steps.
- Prefers plain explanations, no jargon dumps.
- Has a low tolerance for regressions and UI clutter.
- Values honesty: do not claim a feature is done if it is partial.

---

**End of brief.** Now produce the advisory report described in section 10.
