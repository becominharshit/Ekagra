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
| Platforms | Android app + web app from one codebase |
| Builder | First-year student; AI coding tools write most of the code |
| Stack | React + TypeScript + Vite, Capacitor for Android, Supabase backend |
| Budget | $10/month at the start; college funding later if the beta shows results |
| Plan | 2 phases: Phase 1 = a fully working app (milestones M1–M10, docs/3 §0); Phase 2 = everything else |
| College portal | No API → capture tasks by typing, screenshot, share or email |
| Distraction control | Block chosen apps during focus sessions (Android); emergency unlock only through the Academic Tollbooth (3 quick questions → 3 minutes) |
| AI features | All six: syllabus → roadmap, PDF/video → lessons and quizzes, AI tutor, coding practice, past-paper patterns, adaptive challenge |
| Life section | Phase 1: routine blocks and the evening energy check-in; habits and the full section (gym, diet, sleep, communication) in Phase 2 |
| Side hustles | Phase 1 templates: freelancing, content creation, startup, custom (part-time/tutoring uses Custom) |
| Integrations | Google Calendar/Gmail/Drive, YouTube/Instagram, payments, GitHub/Notion, freelance platforms |
| Extra ideas | All seven: spaced repetition + mistake notebook, auto-recovery, exam season mode, weekly review, skill bridge, earnings per hour, accountability partner |
| Tools app | Same login and database; connects in Phase 5 |

## Phases at a glance

1. **Phase 1, a fully working app:** sign-in and Android app; Today with the 14-day planner, "I Crashed" and the evening check-in; Academics (dual-track topic tree, past-paper priority, PDF viewer with AI Anchors and a page tutor, lessons, quizzes, flashcards, mistake notebook, Python Coding Lab); Hustle (templates, Kanban, clients, money, earnings per hour, Skill Bridge, AI capture); focus timers and FocusGuard with the Academic Tollbooth
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
